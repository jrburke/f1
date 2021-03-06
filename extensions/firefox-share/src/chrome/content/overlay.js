/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Raindrop.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc..
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * */

'use strict';
/*jslint indent: 2, es5: true, plusplus: false, onevar: false */
/*global document: false, setInterval: false, clearInterval: false,
  Application: false, gBrowser: false, window: false, Components: false,
  Cc: false, Ci: false, PlacesUtils: false */

var ffshare;
var FFSHARE_EXT_ID = "ffshare@mozilla.org";
(function () {

  Components.utils.import("resource://ffshare/modules/ffshareAutoCompleteData.js");
  Components.utils.import("resource://ffshare/modules/injector.js");

  var slice = Array.prototype.slice,
      ostring = Object.prototype.toString,
      empty = {}, fn;

  function mixin(target, source, override) {
    //TODO: consider ES5 getters and setters in here.
    for (var prop in source) {
      if (!(prop in empty) && (!(prop in target) || override)) {
        target[prop] = source[prop];
      }
    }
  }

  function log(msg) {
    Application.console.log('.' + msg); // avoid clearing on empty log
  }

  function error(msg) {
    Components.utils.reportError('.' + msg); // avoid clearing on empty log
  }

  fn = {

    /**
     * Determines if the input a function.
     * @param {Object} it whatever you want to test to see if it is a function.
     * @returns Boolean
     */
    is: function (it) {
      return ostring.call(it) === '[object Function]';
    },

    /**
     * Different from Function.prototype.bind in ES5 --
     * it has the "this" argument listed first. This is generally
     * more readable, since the "this" object is visible before
     * the function body, reducing chances for error by missing it.
     * If only obj has a real value then obj will be returned,
     * allowing this method to be called even if you are not aware
     * of the format of the obj and f types.
     * It also allows the function to be a string name, in which case,
     * obj[f] is used to find the function.
     * @param {Object||Function} obj the "this" object, or a function.
     * @param {Function||String} f the function of function name that
     * should be called with obj set as the "this" value.
     * @returns {Function}
     */
    bind: function (obj, f) {
      //Do not bother if 
      if (!f) {
        return obj;
      }

      //Make sure we have a function
      if (typeof f === 'string') {
        f = obj[f];
      }
      var args = slice.call(arguments, 2);
      return function () {
        return f.apply(obj, args.concat(slice.call(arguments, 0)));
      };
    }
  };

  function StateProgressListener(tabFrame) {
    this.tabFrame = tabFrame;
  }
  
  StateProgressListener.prototype = {
    // detect communication from the iframe via location setting
    QueryInterface: function (aIID) {
      if (aIID.equals(Components.interfaces.nsIWebProgressListener)   ||
          aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
          aIID.equals(Components.interfaces.nsISupports)) {
        return this;
      }
      throw Components.results.NS_NOINTERFACE;
    },

    onStateChange: function (aWebProgress, aRequest, aStateFlags, aStatus) {
      var flags = Components.interfaces.nsIWebProgressListener;
      if (aStateFlags & flags.STATE_IS_WINDOW &&
                 aStateFlags & flags.STATE_STOP) {
        var status;

        try {
          status = aRequest.nsIHttpChannel.responseStatus;
        } catch (e) {
          //Could be just an invalid URL or not an http thing. Need to be sure to not endlessly
          //load error page if it is already loaded.
          if (this.tabFrame.shareFrame.contentWindow.location.href !== ffshare.errorPage) {
            status = 1000;
          } else {
            status = 200;
          }
        }

        if (status < 200 || status > 399) {
          this.tabFrame.shareFrame.contentWindow.location = ffshare.errorPage;
        } else {
          this.tabFrame.shareFrame.contentWindow.wrappedJSObject.addEventListener("message", fn.bind(this, function (evt) {
            //Make sure we only act on messages from the page we expect.
            if (ffshare.shareUrl.indexOf(evt.origin) === 0) {
              //Mesages have the following properties:
              //name: the string name of the messsage
              //data: the JSON structure of data for the message.
              var message = evt.data, skip = false, topic, data;
              try {
                //Only some messages are valid JSON, only care about the ones
                //that are.
                message = JSON.parse(message);
              } catch (e) {
                skip = true;
              }
  
              if (!skip) {
                topic = message.topic;
                data = message.data;
    
                if (topic && this.tabFrame[topic]) {
                  this.tabFrame[topic](data);
                }
              }
            }
          }), false);
        }
      }
    },

    onLocationChange: function (aWebProgress, aRequest, aLocation) {},
    onProgressChange: function (aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {},
    onSecurityChange: function (aWebProgress, aRequest, aState) {},
    onStatusChange: function (aWebProgress, aRequest, aStatus, aMessage) {
        //log("onStatus Change: " + aRequest.nsIHttpChannel.responseStatus + ": " + aRequest.loadFlags + ", " + aRequest + ", " + aMessage);
    }
  };

  var firstRunProgressListener = {
    QueryInterface: function (iid) {
      if (iid.equals(Components.interfaces.nsIWebProgressListener) ||
          iid.equals(Components.interfaces.nsISupportsWeakReference) ||
          iid.equals(Components.interfaces.nsISupports)) {
        return this;
      }
      throw Components.results.NS_NOINTERFACE;
    },

    onStateChange: function (aWebProgress, aRequest, aStateFlags, aStatus) {
      // maybe can just use onLocationChange, but I don't think so?
      var flags = Components.interfaces.nsIWebProgressListener;
      if (aStateFlags & flags.STATE_IS_WINDOW &&
                 aStateFlags & flags.STATE_STOP) {
        // This seems like an excessive check but works very well
        if (ffshare.firstRun) {
          //Be sure to disable first run after one try. Even if it does
          //not work, do not want to annoy the user with continual popping up
          //of the front page.
          ffshare.firstRun = false;
          ffshare.onFirstRun();
        }
      }
    },

    onLocationChange: function (aWebProgress, aRequest, aLocation) {},
    onProgressChange: function (aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {},
    onSecurityChange: function (aWebProgress, aRequest, aState) {},
    onStatusChange: function (aWebProgress, aRequest, aStatus, aMessage) {}
  };

  function NavProgressListener(tabFrame) {
    this.tabFrame = tabFrame;
  }
  
  NavProgressListener.prototype = {
    // detect navigational events for the tab, so we can close

    QueryInterface: function (aIID) {
      if (aIID.equals(Components.interfaces.nsIWebProgressListener)   ||
          aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
          aIID.equals(Components.interfaces.nsISupports)) {
        return this;
      }
      throw Components.results.NS_NOINTERFACE;
    },

    onLocationChange: function (/*in nsIWebProgress*/ aWebProgress,
                          /*in nsIRequest*/ aRequest,
                          /*in nsIURI*/ aLocation) {
      this.tabFrame.hide();
    },

    onProgressChange: function (aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {},
    onSecurityChange: function (aWebProgress, aRequest, aState) {},
    onStateChange: function (aWebProgress, aRequest, aStateFlags, aStatus) {},
    onStatusChange: function (aWebProgress, aRequest, aStatus, aMessage) {}
  };

  var TabFrame = function (tab) {
    this.tab = tab;
    this.visible = false;
  };

  TabFrame.prototype = {

    registerListener: function () {
      var shareFrameProgress = this.shareFrame.webProgress;

      this.stateProgressListener = new StateProgressListener(this);
      shareFrameProgress.addProgressListener(this.stateProgressListener, Components.interfaces.nsIWebProgress.NOTIFY_STATE_WINDOW);

      this.navProgressListener = new NavProgressListener(this);
      gBrowser.getBrowserForTab(this.tab).webProgress.addProgressListener(this.navProgressListener, Components.interfaces.nsIWebProgress.NOTIFY_LOCATION);
    },
    
    unregisterListener: function (listener) {
      var shareFrameProgress = this.shareFrame.webProgress;
      shareFrameProgress.removeProgressListener(this.stateProgressListener);
      this.stateProgressListener = null;

      gBrowser.getBrowserForTab(this.tab).webProgress.removeProgressListener(this.navProgressListener);
      this.navProgressListener = null;
    },

    hide: function () {
      this.unregisterListener();
      this.changeHeight(0, fn.bind(this, function () {
        this.shareFrame.parentNode.removeChild(this.shareFrame);
        this.shareFrame = null;
      }));
      this.visible = false;
    },

    createShareFrame: function (options) {
      options = options || {};

      var browser = gBrowser.getBrowserForTab(this.tab),
          iframeNode = null, url;
      var notificationBox = gBrowser.getNotificationBox(browser);

      if (iframeNode === null) {
        //Create the iframe.
        iframeNode = document.createElement("browser");

        //Allow the rich autocomplete, something built into gecko.
        iframeNode.setAttribute('autocompletepopup', 'PopupAutoCompleteRichResult');
 
        iframeNode.className = 'ffshare-frame';
        iframeNode.style.width = '100%';
        iframeNode.style.height = '114px';
        //Make sure it can go all the way to zero.
        iframeNode.style.minHeight = 0;

        mixin(options, {
          title: this.getPageTitle(),
          description: this.getPageDescription(),
          medium: this.getPageMedium(),
          url: gBrowser.currentURI.spec,
          canonicalUrl: this.getCanonicalURL(),
          shortUrl: this.getShortURL(),
          previews: this.previews(),
          system: ffshare.system
        });

        if (!options.previews.length && !options.thumbnail) {
          // then we need to make our own thumbnail
          options.thumbnail = this.getThumbnailData();
        }
        url = ffshare.shareUrl +
                  '#options=' + encodeURIComponent(JSON.stringify(options));

        iframeNode.setAttribute("type", "content");
        iframeNode.setAttribute("src", url);
        notificationBox.insertBefore(iframeNode, notificationBox.firstChild);
      }
      return (this.shareFrame = iframeNode);
    },

    show: function (options) {
      var tabUrl = gBrowser.getBrowserForTab(this.tab).currentURI.spec,
          iframeNode;

      //Only open it for http/https urls, file urls for testing.
      if (tabUrl.indexOf('http') !== 0 && tabUrl.indexOf('file') !== 0) {
        return;
      }

      iframeNode = this.shareFrame || this.createShareFrame(options);

      if (ffshare.frontpageUrl === tabUrl) {
        var browser = gBrowser.getBrowserForTab(this.tab);
        // If we're looking at the front page we should clear the first run helper
        var evt = browser.contentWindow.wrappedJSObject.document.createEvent("Event");
        evt.initEvent("hideInstalled", true, false);
        browser.contentWindow.wrappedJSObject.dispatchEvent(evt);
      }

      /*
      //Figure out if CSS transitions can be used. Right now, trying to
      //transition the height as the page loads is too choppy, and waiting
      //for the iframe to load before doing the animation is too long to wait.
      if ('MozTransition' in iframeNode.style) {
        this.useCssTransition = true;
        iframeNode.addEventListener("transitionend", fn.bind(this, 'onTransitionEnd'), true);
      } else {
        this.useCssTransition = false;
      }
      iframeNode.addEventListener('DOMContentLoaded', fn.bind(this, 'matchIframeContentHeight'), true);
      */

      this.visible = true;

      this.registerListener();
    },

    /**
     * Called by content page when share is successful.
     * @param {Object} data info about the share.
     */
    success: function (data) {
      this.hide();

      if (ffshare.useBookmarking) {
        var tags = ['shared', 'f1'];
        if (data.domain === 'twitter.com') {
          tags.push("twitter");
        }
        if (data.domain === 'facebook.com') {
          tags.push("facebook");
        }

        var ios = Cc["@mozilla.org/network/io-service;1"].
               getService(Ci.nsIIOService);
        var nsiuri = ios.newURI(gBrowser.currentURI.spec, null, null);
        var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
                    .getService(Components.interfaces.nsINavBookmarksService);
        bmsvc.insertBookmark(bmsvc.unfiledBookmarksFolder, nsiuri, bmsvc.DEFAULT_INDEX, this.getPageTitle().trim());

        PlacesUtils.tagging.tagURI(nsiuri, tags);
      }
    },

    changeHeight: function (height, onEnd) {

      if (this.useCssTransition) {
        this.onHeightEnd = onEnd;
      }
      
      this.shareFrame.style.height = height + 'px';

      if (!this.useCssTransition && onEnd) {
        onEnd();
      }
    },

    matchIframeContentHeight: function () {
      var height = this.shareFrame.contentDocument.documentElement.getBoundingClientRect().height;
      this.changeHeight(height);
    },

    onTransitionEnd: function (evt) {
      if (this.onHeightEnd) {
        this.onHeightEnd();
      }
    },

    getPageTitle: function () {
      var metaNodes = gBrowser.contentDocument.getElementsByTagName('meta');
      var titleNode = gBrowser.contentDocument.getElementsByTagName('title')[0];
      for (var i = 0; i < metaNodes.length; i++) {
        if ("title" === metaNodes[i].getAttribute("name")) {
          var content = metaNodes[i].getAttribute("content");
          if (content) {
            return content.trim();
          }
        }
      }
      if (titleNode) {
        return titleNode.firstChild.nodeValue.trim();
      }
      return '';
    },

    getPageDescription: function () {
      var metaNodes = gBrowser.contentDocument.getElementsByTagName('meta');
      for (var i = 0; i < metaNodes.length; i++) {
        if ("description" === metaNodes[i].getAttribute("name")) {
          var content = metaNodes[i].getAttribute("content");
          if (content) {
            return content;
          }
        }
      }
      return "";
    },

    // According to Facebook - (only the first 3 are interesting)
    // Valid values for medium_type are audio, image, video, news, blog, and mult.
    getPageMedium: function () {
      var metaNodes = gBrowser.contentDocument.getElementsByTagName('meta');
      for (var i = 0; i < metaNodes.length; i++) {
        if ("medium" === metaNodes[i].getAttribute("name")) {
          var content = metaNodes[i].getAttribute("content");
          if (content) {
            return content;
          }
        }
      }
      return "";
    },

    getShortURL: function () {
      var links = gBrowser.contentDocument.getElementsByTagName("link"),
        rel = null,
        rev = null,
        i;

      // flickr does id="shorturl"
      var shorturl = gBrowser.contentDocument.getElementById("shorturl");
      if (shorturl) {
        return shorturl.getAttribute("href");
      }

      for (i = 0; i < links.length; i++) {
        // is there a rel=shortlink href?
        if (links[i].getAttribute("rel") === "shortlink") {
          return gBrowser.currentURI.resolve(links[i].getAttribute("href"));
        }
      }
      return "";
    },

    getCanonicalURL: function () {
      var links = gBrowser.contentDocument.getElementsByTagName("link"),
        rel = null,
        i;

      for (i = 0; i < links.length; i++) {
        if (links[i].getAttribute("rel") === "canonical") {
          return gBrowser.currentURI.resolve(links[i].getAttribute("href"));
        }
      }

      // Finally try some hacks for certain sites
      return this.getURLHacks();
    },

    // This will likely be a collection of hacks for certain sites we want to
    // work but currently don't provide the right kind of meta data
    getURLHacks: function () {
      // Google Maps Hack :( obviously this regex isn't robust
      if (/^maps\.google.*/.test(gBrowser.currentURI.spec)) {
        return gBrowser.contentDocument.getElementById("link").getAttribute("href");
      }

      return '';
    },

    getThumbnailData: function () {
      var canvas = gBrowser.contentDocument.createElement("canvas"); // where?
      canvas.setAttribute('width', '90');
      canvas.setAttribute('height', '70');
      var tab = this.tab;
      var win = gBrowser.getBrowserForTab(tab).contentWindow;
      var aspectRatio = canvas.width / canvas.height;
      var w = win.innerWidth + win.scrollMaxX;
      var h = Math.max(win.innerHeight, w / aspectRatio);

      if (w > 10000) {
        w = 10000;
      }
      if (h > 10000) {
        h = 10000;
      }

      var canvasW = canvas.width;
      var canvasH = canvas.height;
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.save();

      var scale = canvasH / h;
      ctx.scale(scale, scale);
      ctx.drawWindow(win, 0, 0, w, h, "rgb(255,255,255)");
      ctx.restore();
      return canvas.toDataURL("image/png", "");
    },

    previews: function () {
      // Look for rel="image_src" and use those if they're available
      // see e.g. http://about.digg.com/thumbnails

      var links = gBrowser.contentDocument.getElementsByTagName("link"),
          previews = [], i;

      for (i = 0; i < links.length; i++) {
        if (links[i].getAttribute("rel") === "image_src") {
          previews.push(links[i].getAttribute("href"));
        }
      }
      return previews;
    },

    //Methods for handling autocomplete

    escapeHtml: function (text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    autoCompleteData: function (data) {
      ffshareAutoCompleteData.set(data);
    }
  };

  function sendJustInstalledEvent(browser, rect) {
    browser.contentWindow.wrappedJSObject.buttonX = rect.left + rect.width / 2;
    var evt = browser.contentWindow.wrappedJSObject.document.createEvent("Event");
    evt.initEvent("buttonX", true, false);
    browser.contentWindow.wrappedJSObject.dispatchEvent(evt);
  }

  function makeInstalledLoadHandler(browser, rect) {
    return function () {
      sendJustInstalledEvent(browser, rect);
    };
  }

  ffshare = {

    system: Application.prefs.getValue("extensions." + FFSHARE_EXT_ID + ".system", "prod"),
    shareUrl: Application.prefs.getValue("extensions." + FFSHARE_EXT_ID + ".share_url", ""),
    frontpageUrl: Application.prefs.getValue("extensions." + FFSHARE_EXT_ID + ".frontpage_url", ""),
    useBookmarking: Application.prefs.getValue("extensions." + FFSHARE_EXT_ID + ".bookmarking", true),
    firstRun: Application.prefs.getValue("extensions." + FFSHARE_EXT_ID + ".first-install", true),

    errorPage: 'chrome://ffshare/content/down.html',

    onLoad: function () {
      // initialization code
      if (this.firstRun) {
        gBrowser.getBrowserForTab(gBrowser.selectedTab).addProgressListener(firstRunProgressListener, Components.interfaces.nsIWebProgress.STATE_DOCUMENT);
        this.addedFirstRunProgressListener = true;
      }
    },

    onUnload: function () {
      // initialization code
      if (this.addedFirstRunProgressListener) {
        gBrowser.getBrowserForTab(gBrowser.selectedTab).removeProgressListener(firstRunProgressListener);
      }
    },

    onFirstRun: function () {
      // create a hidden iframe and get it to load the standard contents
      // to prefill the cache
      var browser = gBrowser.getBrowserForTab(gBrowser.selectedTab);
      var notificationBox = gBrowser.getNotificationBox(browser);
      var iframeNode = document.createElement("browser");
      iframeNode.setAttribute("type", "content");
      iframeNode.setAttribute("style", "width: 100px; height: 100px; background: pink;");
      iframeNode.setAttribute("src", this.shareUrl);
      iframeNode.setAttribute("style", "visibility: collapse;");
      notificationBox.insertBefore(iframeNode, notificationBox.firstChild);

      //Taken from https://developer.mozilla.org/en/Code_snippets/Tabbed_browser
      function openAndReuseOneTabPerURL(url) {
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                           .getService(Components.interfaces.nsIWindowMediator);
        var browserEnumerator = wm.getEnumerator("navigator:browser"),
            rect, browser;

        // Check each browser instance for our URL
        var found = false;
        while (!found && browserEnumerator.hasMoreElements()) {
          var browserWin = browserEnumerator.getNext();
          var tabbrowser = browserWin.gBrowser;

          // Check each tab of this browser instance
          var numTabs = tabbrowser.browsers.length;
          for (var index = 0; index < numTabs; index++) {
            var currentBrowser = tabbrowser.getBrowserAtIndex(index);
            if (url === currentBrowser.currentURI.spec) {

              // The URL is already opened. Select this tab.
              tabbrowser.selectedTab = tabbrowser.tabContainer.childNodes[index];

              // Focus *this* browser-window
              browserWin.focus();

              rect = browserWin.document.getElementById("ffshare-toolbar-button").getBoundingClientRect();
              browser = gBrowser.getBrowserForTab(tabbrowser.selectedTab);

              // try setting the button location as the window may have already loaded
              try {
                sendJustInstalledEvent(browser, rect);
              } catch (ignore) { }

              // Add the load handler in case the window hasn't finished loaded (unlikely)
              browser.addEventListener("load", makeInstalledLoadHandler(browser, rect), true);

              found = true;
              break;
            }
          }
        }

        // Our URL isn't open. Open it now.
        if (!found) {
          var recentWindow = wm.getMostRecentWindow("navigator:browser");
          if (recentWindow) {
            rect = recentWindow.document.getElementById("ffshare-toolbar-button").getBoundingClientRect();
            // Use the existing browser (recent) Window
            var tab = recentWindow.gBrowser.loadOneTab(url, { referrerURI: null,
                                                             charset: null,
                                                             postData: null,
                                                             inBackground: false,
                                                             allowThirdPartyFixup: null });
            browser = gBrowser.getBrowserForTab(tab);
            browser.addEventListener("load",
                                    function buttonX() {
                                      browser.removeEventListener("load", buttonX, true);
                                      browser.contentWindow.wrappedJSObject.buttonX = rect.left + rect.width / 2;
                                      var evt = browser.contentWindow.wrappedJSObject.document.createEvent("Event");
                                      evt.initEvent("buttonX", true, false);
                                      browser.contentWindow.wrappedJSObject.dispatchEvent(evt);
                                    }, true);
          }
          else {
            // No browser windows are open, so open a new one.
            window.open(url);
          }
        }
      }

      openAndReuseOneTabPerURL(this.frontpageUrl);

      // curse you first install prefs!
      Application.prefs.setValue("extensions." + FFSHARE_EXT_ID + ".first-install", false);
    },

    onMenuItemCommand: function (e) {
      this.toggle();
    },

    onToolbarButtonCommand: function (e) {
      this.toggle();
    },
    
    toggle: function (options) {
      var selectedTab = gBrowser.selectedTab,
          tabFrame = selectedTab.ffshareTabFrame;
      if (!tabFrame) {
        tabFrame = new TabFrame(selectedTab);
        selectedTab.ffshareTabFrame = tabFrame;
      }

      if (tabFrame.visible) {
        tabFrame.hide();
      } else {
        tabFrame.show(options);
      }      
    }
  };

  if (!ffshare.shareUrl) {
    if (ffshare.system === 'dev') {
      ffshare.shareUrl = 'http://linkdrop.caraveo.com:5000/share/';
    } else {
      ffshare.shareUrl = 'https://f1.mozillamessaging.com/share/';
    }
  }

  if (!ffshare.frontpageUrl) {
    if (ffshare.system === 'dev') {
      ffshare.frontpageUrl = 'http://linkdrop.caraveo.com:5000/';
    } else {
      ffshare.frontpageUrl = 'http://f1.mozillamessaging.com/';
    }
  }

  var ffapi = {
    apibase: null, // null == 'navigator.mozilla.labs'
    name: 'share', // builds to 'navigator.mozilla.labs.share'
    script: null, // null == use injected default script
    getapi: function () {
      return function (options) {
        ffshare.toggle(options);
      };
    }
  };
  InjectorInit(window);
  injector.register(ffapi);

  window.addEventListener("load", fn.bind(ffshare, "onLoad"), false);
  window.addEventListener("unload", fn.bind(ffshare, "onUnload"), false);
}());
