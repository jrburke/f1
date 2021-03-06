# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is Raindrop.
#
# The Initial Developer of the Original Code is
# Mozilla Messaging, Inc..
# Portions created by the Initial Developer are Copyright (C) 2009
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#

from linkdrop.lib.oauth import facebook_
from linkdrop.lib.oauth import google_
#from linkdrop.lib.oauth.live_ import LiveResponder
#from linkdrop.lib.oauth.openidconsumer import OpenIDResponder
from linkdrop.lib.oauth import twitter_
from linkdrop.lib.oauth import yahoo_

__all__ = ['get_provider']

# XXX need a better way to do this
_providers = {
    twitter_.domain:  twitter_,
    facebook_.domain: facebook_,
    google_.domain: google_,
    yahoo_.domain: yahoo_
}

def get_provider(provider):
    return _providers.get(provider)
