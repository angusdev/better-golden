var DEBUG = false;
function debug(m) {
  if (DEBUG) {
    if (console && typeof console.log !== 'undefined') {
      console.log(m);
    }
  }
}

function parse_view_url(url) {
  var msgId = url.match(/[\?|\&]message=(\d+)/);
  var type = url.match(/[\?|\&]type=([a-zA-Z0-9]+)/);
  var forum = url.match(/^https?\:\/\/forum(\d+)\.hkgolden\.com\//);
  if (msgId) {
    msgId = parseInt(msgId[1], 10);
  }
  if (type) {
    type = type[1];
  }
  if (forum) {
    forum = forum[1];
  }

  return {
    forum: forum,
    type: type,
    msgId: msgId
  };
}

function message_get_options(request, sender, sendResponse) {
  var defaultOptions = {
    version: 1.0,
    favicon: 1,
    idle: 2 * 60 * 60 * 1000,
    menupos: 'top',
    menubtnstyle: 'both',
    blur: true,
    youtube: 0,
    disablesensor: true,
    scrollmarkread: true,
    collapsequickreply: true,
    wheel: false
  };

  chrome.storage.local.get(['version', 'favicon', 'idle', 'menupos', 'menubtnstyle',
                            'blur', 'disablesensor', 'youtube', 'scrollmarkread',
                            'collapsequickreply', 'wheel'], function(obj) {
    var options = {};
    for (var k in obj) {
      options[k] = obj[k];
    }

    // version check
    if (typeof options.version === 'undefined' || parseFloat(options.version) < parseFloat(defaultOptions.version)) {
      // an upgrade
      for (k in defaultOptions) {
        if (typeof options[k] === 'undefined') {
          options[k] = defaultOptions[k];
        }
        options.version = defaultOptions.version;
      }
      chrome.storage.local.set(options);
    }

    sendResponse( { success:true, options:options });
  });

  return true;
}

function get_message_history_helper(request, sender, callback) {
  chrome.storage.sync.get(['messagehistory'], function(obj) {
    if (callback) {
      callback.apply(obj.messagehistory);
    }
  });
}

function message_get_message_history(request, sender, sendResponse) {
  get_message_history_helper(request, sender, function() {
    sendResponse( { success:true, messagehistory: this });
  });

  return true;
}

function message_add_message_history(request, sender, sendResponse) {
  get_message_history_helper(request, sender, function() {
    var cacheExpiry = 86400 * 1000 * 30;
    var maxCacheItem = 1000;

    var now = new Date().getTime();
    var data = this || [];
    var prevMaxPage = 0;
    // clean up cache
    for (var i=0; i<data.length; i++) {
      if (data[i].msgId === request.msg.msgId) {
        prevMaxPage = data[i].maxPage || 0;
        data.splice(i--, 1);
      }
      else if (now - data[i].timestamp >= cacheExpiry) {
        data.splice(i--, 1);
      }
    }
    if (data.length >= maxCacheItem) {
      data.splice(0, maxCacheItem / 10);
    }
    data.push({
                version: 1,
                msgId: request.msg.msgId,
                currPage: request.msg.pageNum,
                maxPage: Math.max(request.msg.pageNum, prevMaxPage),
                timestamp: now
              });
    chrome.storage.sync.set( { messagehistory:data } );
    sendResponse( { success:true, messagehistory: data });
  });

  return true;
}

chrome.extension.onMessage.addListener(
  function(request, sender, sendResponse) {
    try {
      debug((sender.tab ? 'from a content script:' + sender.tab.url : 'from the extension:') + ' ' + request.msgId);
      if (request.msgId === 'get_options') {
        return message_get_options(request, sender, sendResponse);
      }
      else if (request.msgId === 'set_options') {
        if (DEBUG) {
          for (var key in request.newOptions) {
            debug('new option ' + key + '=' + request.newOptions[key]);
          }
        }
        chrome.storage.local.set(request.newOptions);
        sendResponse({ success:true });
        return false;
      }
      else if (request.msgId === 'get_message_history') {
        return message_get_message_history(request, sender, sendResponse);
      }
      else if (request.msgId === 'add_message_history') {
        return message_add_message_history(request, sender, sendResponse);
      }
      else if (request.msgId === 'get_tabs_url') {
        var urls = [];
        chrome.windows.getCurrent({populate: true}, function(result) {
          for (var i=0;i<result.tabs.length;i++) {
            var tab = result.tabs[i];
            if (tab.url.match(/^http\:\/\/forum\d+\.hkgolden\.com\/view\.aspx/)) {
              urls.push(tab.url);
            }
          }

          sendResponse({ urls: urls });
        });

        return true;
      }
      else if (request.msgId === 'open_or_focus') {
        chrome.windows.getCurrent({populate: true}, function(result) {
          for (var i=0;i<result.tabs.length;i++) {
            var tab = result.tabs[i];
            if (request.url == tab.url) {
              debug('open_or_focus found');
              chrome.tabs.update(tab.id, {active: true});
              sendResponse({ success: true });
              return;
            }
          }

          // cannot find tab match the url
          debug('open_or_focus create new');
          chrome.tabs.create({ url: request.url });
          sendResponse({ success: true });
        });

        return true;
      }
      else if (request.msgId === 'bring_to_front') {
        var parsed = parse_view_url(request.url);
        debug('bring_to_front ' + request.url);
        if (parsed.msgId) {
          chrome.windows.getCurrent({populate: true}, function(result) {
            for (var i=0;i<result.tabs.length;i++) {
              var tab = result.tabs[i];
              if (tab.url.match(/^http\:\/\/forum\d+\.hkgolden\.com\/view\.aspx/)) {
              debug('bring_to_front ' + tab.url);
              var parsed_a = parse_view_url(tab.url);
                if (parsed.msgId === parsed_a.msgId) {
                  debug('bring_to_front hit tab.tabId=' + tab.id);
                  chrome.tabs.update(tab.id, {active: true});
                  sendResponse({ success: true });
                  return;
                }
              }
            }

            // cannot find tab match the url
            chrome.tabs.create({ url: request.url });
            sendResponse({ success: true });
          });

          return true;
        }
        else {
          sendResponse({ success: false });
        }
      }
    }
    catch (err) {
      debug(err);
    }
    finally {
      debug('onMessage end');
    }
  }
);
