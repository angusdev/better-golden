/*jshint white: false, browser: true, onevar:false */
/*global chrome, console, org, moment, lscache, RawDeflate, Base64 */
(function() {
'use strict';

var utils = org.ellab.utils;
var extract = org.ellab.utils.extract;
var xpath = org.ellab.utils.xpath;
var xpathl = org.ellab.utils.xpathl;
var $ = org.ellab.utils.sizzleSmart;
var $1 = org.ellab.utils.sizzleOne;
var $e = org.ellab.utils.sizzleEach;

var DEBUG = false;
var PERFORMANCE = false;
var AJAX_WAIT = 1000; // wait for each ajax call, golden will block too frequent requests

var FAVICON = [{}, {}, {}];
FAVICON[1].NEW_MESSAGE = utils.getResourceURL('new-message', 'images/new-message.png');
FAVICON[1].NO_MESSAGE = utils.getResourceURL('no-message', 'images/clock.png');
FAVICON[1].GOLDEN_ICON = utils.getResourceURL('golden-favicon', 'images/golden-favicon.png');
FAVICON[2].NEW_MESSAGE = utils.getResourceURL('new-message', 'images/new-message-blank.png');
FAVICON[2].NO_MESSAGE = utils.getResourceURL('no-message', 'images/clock.png');
FAVICON[2].GOLDEN_ICON = utils.getResourceURL('golden-favicon', 'images/golden-favicon-blank.png');

var GOLDEN_TIMEFMT = 'M/D/YYYY H:mm A';
var GOLDEN_TIMEFMT_OLD = 'D/M/YYYY HH:mm';

var g_options = {};
var g_is_blur = false;  // is included the blur css
var g_threads = [];
var g_lastThreadNode;
var g_ajaxQueue = [];

function error(m) {
  if (console && typeof console.log !== undefined) {
    console.log('error', m);
  }
}

function debug(m) {
  if (DEBUG) {
    if (console && typeof console.log !== undefined) {
      console.log(m);
    }
  }
}

function performance(m, time) {
  if (PERFORMANCE && DEBUG) {
    var now = new Date();
    if (time) {
      m = (now - time) + 'ms ' + m;
    }
    debug(m);

    return now;
  }
}

function meta(key, value) {
  if (value === undefined) {
    return document.body.getAttribute('ellab-' + key);
  }
  else {
    document.body.setAttribute('ellab-' + key, value);
    return value;
  }
}

function meta_int(key, defaultValue) {
  var i = parseInt(meta(key), 10);
  if (isNaN(i) && defaultValue !== undefined) {
    i = defaultValue;
  }

  return i;
}

// for some unknown reason the g_options[key] may be string or object, e.g. true vs 'true'
// so force to do string comparison
function option_equal(key, value) {
  if (typeof g_options[key] === 'undefined') {
    return typeof value === 'undefined';
  }

  return ('' + g_options[key]) === ('' + value);
}

function createDocument(obj) {
  if (typeof obj === 'string') {
    //var doc = document.implementation.createHTMLDocument('http://www.w3.org/1999/xhtml', 'html',  null);
    //doc.documentElement.innerHTML = obj;
    var parser = new DOMParser();
    var doc = parser.parseFromString(obj, "text/html");
    return doc;
  }
  else {
    return obj;
  }
}

function ajax_queue_worker() {
  var task = g_ajaxQueue.shift();
  if (task && task.url && task.callback) {
    debug('ajax_queue_worker:' + task.url);

    utils.crossOriginXMLHttpRequest({
      url: task.url,
      method: task.method || 'get',
      data: task.data,
      onload: function(response) {
        try {
          task.callback.call(this, response, task.args);
        }
        catch (err) {
          error('exception in ajax_queue_worker:' + err);
        }
        window.setTimeout(ajax_queue_worker, AJAX_WAIT);
      }
    });
  }
  else {
    window.setTimeout(ajax_queue_worker, AJAX_WAIT);
  }
}

function animate_scroll_to(scrollTo, interval) {
  var start = new Date().getTime();
  var startY = window.scrollY;

  function scroller() {
    var now = new Date().getTime();
    if (now - start >= interval) {
      window.scrollTo(0, scrollTo);
    }
    else {
      window.scrollTo(0, Math.min(scrollTo, startY + (scrollTo - startY) * (now - start) / interval));
      window.setTimeout(scroller, 10);
    }
  }
  window.setTimeout(scroller, 20);
}

function parse_view_url(url) {
  var msgId = url.match(/[\?|\&]message=(\d+)/);
  var type = url.match(/[\?|\&]type=([a-zA-Z0-9]+)/);
  var pageNum = url.match(/[\?|\&]page=(\d+)/);
  var forum = url.match(/^https?\:\/\/forum(\d+)\.hkgolden\.com\//);
  if (msgId) {
    msgId = parseInt(msgId[1], 10);
  }
  if (type) {
    type = type[1];
  }
  if (pageNum) {
    pageNum = pageNum[1];
  }
  if (forum) {
    forum = forum[1];
  }
  else if (url.match(/^https?\:\/\/search\.hkgolden\.com\//)) {
    forum = 'search';
  }

  return {
    forum: forum,
    type: type,
    pageNum: pageNum,
    msgId: msgId
  };
}

function guess_time_format(time) {
  if (typeof(time) !== 'string') {
    return GOLDEN_TIMEFMT;
  }

  if (time.match(/\d\d?\/\d\d?\/\d{4} \d\d?\:\d\d( [A|P]M)?/)) {
    return GOLDEN_TIMEFMT;
  }
  else {
    return GOLDEN_TIMEFMT_OLD;
  }
}

function change_favicon(key) {
  var favicon = g_options.favicon;
  if (favicon == 1 || favicon == 2) {
    utils.changeFavicon(FAVICON[favicon][key]);
  }
}

function on_options_changed(obj) {
  var key;
  for (key in obj) {
    g_options[key] = obj[key].newValue;
    on_options_value_changed(key);
  }
}

function on_options_value_changed(key) {
  debug('options value changed:' + key + '=' + g_options[key]);

  if (key === 'menupos') {
    utils.removeClass($('#ellab-menubar'), 'menubar-bottom');
    if (g_options.menupos === 'bottom') {
      utils.addClass($('#ellab-menubar'), 'menubar-bottom');
    }
  }
  else if (key === 'menubtnstyle') {
    $e('#ellab-menubar .ellab-button a span', function() {
      this.style.display = (option_equal('menubtnstyle', 'icon')?'none':'');
    });
    if (option_equal('menubtnstyle', 'text')) {
      $e('#ellab-menubar .ellab-button', function() {
        utils.removeClass(this, 'icon');
      });
    }
    else {
      $e('#ellab-menubar .ellab-button', function() {
        utils.addClass(this, 'icon');
      });
    }
  }
  else if (g_is_blur && key === 'blur') {
    if (!option_equal('blur', true)) {
      utils.addClass(document.body, 'ellab-noblur');
      utils.addClass($('#ellab-blur-btn'), 'on');
    }
    else {
      utils.removeClass(document.body, 'ellab-noblur');
      utils.removeClass($('#ellab-blur-btn'), 'on');
    }
  }
  else if (key === 'youtube') {
    view_expand_youtube_enabler();
  }
  else if (key === 'collapsequickreply') {
    if (option_equal('collapsequickreply', true)) {
      utils.addClass(document.body, 'ellab-collapsequickreply');
    }
    else {
      utils.removeClass(document.body, 'ellab-collapsequickreply');
    }
  }
}

function set_cache(key, value, time) {
  if (lscache) {
    return lscache.set(key, value, time || (14*60*24));
  }
}

function get_cache(key, defaultValue) {
  var result = null;
  if (lscache) {
    result = lscache.get(key);
  }
  return result || defaultValue;
}

function remove_cache(key) {
  if (lscache) {
    lscache.remove(key);
  }
}

// remove empty row causes by ad blocker
function topics_remove_ad_empty_row() {
  xpathl('//div[@class="Topic_ListPanel"]//td[@height="52"]').each(function() {
    this.parentNode.parentNode.removeChild(this.parentNode);
  });
}

function topics_add_golden_show_link() {
  var parsed = parse_view_url(document.location.href);
  xpathl('//div[@id="HotTopics"]/div/table/tbody/tr/td[1]/img').each(function() {
    var msgId = this.parentNode.parentNode.cells[1].getElementsByTagName('a')[0].href.match(/message=(\d+)/)[1];
    var a = document.createElement('a');
    a.href = 'http://ellab.org/goldenshow.php#hkg' + parsed.forum + '/' + msgId;
    a.title = 'GoldenShow';
    a.target = '_blank';
    var parent = this.parentNode;
    parent.removeChild(this);
    a.appendChild(this);
    parent.appendChild(a);
  });
}

function topics_open_link_new_window() {
  xpathl('//div[@class="Topic_ListPanel"]/div/div//a[contains(@href, "view.aspx?")]').each(function() {
    this.setAttribute('target', '_blank');
  });
}

function topics_message_history() {
  chrome.extension.sendMessage({msgId: 'get_message_history'}, function(response) {
    if (response && response.success) {
      var map = {};
      utils.each(response.messagehistory, function() {
        map[this.msgId] = this;
      });

      $e('a[href*="view.aspx"]', function() {
        var parsed = parse_view_url(this.getAttribute('href'));
        if (parsed) {
          var mapped = map[parsed.msgId];
          if (mapped) {
            if (!parsed.pageNum) {
              utils.addClass(this, 'ellab-message-history-visited');
              // this.parentNode.innerHTML += ' [<a href="#">' + mapped.currPage + ']</a>' +
                                           // ' / [<a href="#">' + mapped.maxPage + ']</a>';
            }
            else if (parsed.pageNum == mapped.currPage) {
              utils.addClass(this, 'ellab-message-history-currpage');
            }
            else if (parsed.pageNum < mapped.maxPage) {
              utils.addClass(this, 'ellab-message-history-oldpage');
            }
            else if (parsed.pageNum == mapped.maxPage) {
              utils.addClass(this, 'ellab-message-history-maxpage');
            }
          }
        }
      });
    }
  });
}

function topics_opened_tabs() {
  // iterate the topic list to see if it matches the tab url
  function p_topics_opened_tabs(parsed) {
    xpathl('//div[@class="Topic_ListPanel"]/div/div//a[contains(@href, "view.aspx?")]').each(function() {
      var parsed_a = parse_view_url(this.href);
      debug('topics_opened_tabs aurl=' + this.href + ', ' + parsed_a.msgId + ', ' + parsed_a.type);
      if (parsed.msgId === parsed_a.msgId) {
        //debug('topics_opened_tabs url matched');
        //this.parentNode.className += ' ellab-in-other-tab';
        var tr = this.parentNode.parentNode;
        xpathl('./td', tr).each(function() {
          this.className += ' ellab-in-other-tab';
        });

        if (!this.getAttribute('ellab-attach-bring-to-front-listener')) {
          this.setAttribute('ellab-attach-bring-to-front-listener', 'true');
          this.addEventListener('click', function(e) {
            chrome.extension.sendMessage({msgId: 'bring_to_front', url:this.href }, function(response) {
              debug('bring-to-front click=' + response.success);
              if (response.success) {
                e.preventDefault();
                e.stopPropagation();
              }
            });
            e.preventDefault();
            e.stopPropagation();
          }, false);
        }
      }
    });
  }

  chrome.extension.sendMessage({msgId: 'get_tabs_url'}, function(response) {
    // clear the style first
    xpathl('//td[contains(concat(" ", @class, " "), " ellab-in-other-tab ")]').each(function() {
      this.className = this.className.replace(/\s*ellab-in-other-tab/, '');
    });

    debug('topics_opened_tabs=' + response.urls);
    for (var i=0;i<response.urls.length;i++) {
      var parsed = parse_view_url(response.urls[i]);
      if (parsed.msgId) {
        //debug('topics_opened_tabs taburl=' + response.urls[i] + ', ' + parsed.msgId + ', ' + parsed.type);
        p_topics_opened_tabs(parsed);
      }
    }
  });
}

function topics_disable_sensor() {
  if (!option_equal('disablesensor', true)) {
    return;
  }

  xpathl('//div[@class="Topic_ListPanel"]/div/div//a[contains(@href, "view.aspx?")]').each(function() {
    if (this.href.match(/&sensormode=\w/)) {
      this.href.replace(/&sensormode=\w/, '&sensormode=N');
    }
    else {
      this.href += '&sensormode=N';
    }
  });
}

function view_onready() {
  // clear all setTimeout or setInterval
  var timeoutId = window.setTimeout(function() {}, 0);
  debug('clean window.setTimeOut id=' + timeoutId);
  while (timeoutId--) {
    window.clearTimeout(timeoutId);
  }
  var intervalId = window.setInterval(function() {}, 60000 * 100);
  debug('clean window.setInterval id=' + intervalId);
  do {
    window.clearInterval(intervalId);
  } while (intervalId--);

  g_threads = view_parse_thread_list();
  if (g_threads.length > 0) {
    meta('thread-no', g_threads[g_threads.length - 1].threadId);
    meta('curr-thread', g_threads[g_threads.length - 1].threadId);
    g_lastThreadNode = g_threads[g_threads.length - 1].node;
  }

  document.title = view_parse_ajax_title(document.head.innerHTML) || document.title;
  meta('title', document.title);

  var parsed = parse_view_url(document.location.href);
  if (parsed) {
    meta('server', parsed.forum);
    meta('msg-id', parsed.msgId);

    chrome.extension.sendMessage({msgId: 'add_message_history', msg: { msgId:parsed.msgId, pageNum: parsed.pageNum }});

  }
  meta('golden-show-url', 'http://ellab.org/goldenshow.php#hkg' + meta('server') + '/' + meta('msg-id'));

  if (DEBUG) {
    xpathl('//div[@id="ctl00_ContentPlaceHolder1_view_form"]/div').each(function(i) {
      this.setAttribute('ellab-debug-div', i);
    });
  }
}

// page = topics/view
function menubar(page) {
  var div = document.createElement('div');
  div.setAttribute('id', 'ellab-menubar');
  div.innerHTML = '<div id="ellab-menubar-title"></div>' +
                  '<span id="ellab-menubar-msg"></span>' +
                  '<div style="float:right;margin-right:20px;">' +
                  '  <div class="ellab-button" id="ellab-markread-btn"><a href="#"><span>已讀</span></a></div>' +
                  '  <div class="ellab-button" id="ellab-goldenshow-btn" style="display:none;"><a href="' + meta('golden-show-url') + '" target="_blank"><span>GoldenShow</span></a></div>' +
                  '  <div class="ellab-button" id="ellab-reload-btn"><a href="#" onclick="document.location.reload();return false;"><span>重載</span></a></div>' +
                  '  <div class="ellab-button" id="ellab-blur-btn"><a href="#"><span>亮度</span></a></div>' +
                  '  <div class="ellab-button" id="ellab-blockquote-btn"><a href="#"><span>顯示所有引用</span></a></div>' +
                  '  <div class="ellab-button" id="ellab-tweet-btn"><a href="#"><span>分享到 Twitter</span></a></div>' +
                  '  <div class="ellab-button" id="ellab-options-btn"><a href="#"><span>設定</span></a></div>' +
                  '  <div class="ellab-button" id="ellab-close-btn" style="display:none;"><a href="#"><span>關閉</span></a></div>' +
                  '</div>';
  document.body.appendChild(div);
  on_options_value_changed('menupos');
  on_options_value_changed('menubtnstyle');

  if (page == 'topics') {
    $('#ellab-markread-btn').style.display = 'none';
    $('#ellab-tweet-btn').style.display = 'none';
    if (!g_is_blur) {
      // if g_is_blur == false, there is only options button and reload btn, better to hide it
      $('#ellab-menubar').style.display = 'none';
    }
  }
  if (!g_is_blur) {
    $('#ellab-blur-btn').style.display = 'none';
  }

  $('#ellab-menubar-title').innerHTML = utils.encodeHTML(meta('title'));
  $('#ellab-menubar-title').setAttribute('title', utils.encodeHTML(meta('title')));

  function p_mark_as_read_helper() {
    xpathl('//*[contains(concat(" ", @class, " "), " ellab-new-reply ")]').each(function() {
      this.className = this.className.replace('ellab-new-reply', '');
    });
    meta('thread-no', meta('curr-thread'));
    document.title = meta('title');
    view_notice('');
    change_favicon('GOLDEN_ICON');
  }

  // mark as read button
  utils.detectScroll(function(pos) {
    if (option_equal('scrollmarkread', true)) {
      if (pos === 'bottom') {
        p_mark_as_read_helper();
      }
    }
  });

  $('#ellab-markread-btn').addEventListener('click', function(e) {
    p_mark_as_read_helper();
    e.stopPropagation();
    e.preventDefault();
  }, false);

  // blur button
  $('#ellab-blur-btn').addEventListener('click', function(e) {
    chrome.extension.sendMessage({msgId: 'set_options', newOptions:{ 'blur':utils.hasClass($('#ellab-blur-btn'), 'on') }});
    e.stopPropagation();
    e.preventDefault();
  });

  // blockquote button
  $('#ellab-blockquote-btn').addEventListener('click', function(e) {
    $e('td > div > blockquote > div > blockquote > div > blockquote > div > blockquote', function() {
      utils.toggleClass(this, 'quote-expanded');
    });
    $e('td > div > blockquote > div > blockquote > div > blockquote > div > blockquote > div > blockquote', function() {
      this.style.display = this.style.display==='block'?'none':'block';
    });

    e.stopPropagation();
    e.preventDefault();
  });

  // tweet button
  $('#ellab-tweet-btn').addEventListener('click', function(e) {
    var x = screen.width/2 - 700/2;
    var y = screen.height/2 - 500/2;
    var url = encodeURIComponent('http://diu.li/' + meta('msg-id'));
    var text = encodeURIComponent(meta('title').replace(/ \- [^-]*$/, ''));
    window.open('https://twitter.com/intent/tweet?hashtags=hkgolden&source=tweetbutton&text=' + text + '&url=' + url,
                'tweet',
                'height=485,width=700,left=' + x +',top=' + y);
    e.stopPropagation();
    e.preventDefault();
  });

  // option button
  $('#ellab-options-btn').addEventListener('click', function(e) {
    chrome.extension.sendMessage({msgId: 'open_or_focus', url:chrome.extension.getURL('options.html') });
    e.stopPropagation();
    e.preventDefault();
  });

  // close menu bar button
  $('#ellab-close-btn').addEventListener('click', function(e) {
    var menubar = $('#ellab-menubar');
    var startTime = new Date().getTime();
    var duration = 500;
    var interval = window.setInterval(function(e) {
      var opa = menubar.style.opacity;
      var now = new Date().getTime();
      if (now >= startTime + duration) {
        menubar.style.opacity = 0;
        menubar.style.display = 'none';
        window.clearInterval(interval);
        debug('animation stop');
      }
      else {
        menubar.style.opacity = Math.max(0, 1 - (now - startTime) * 1.0 / duration);
        debug('animation opacity=' + Math.max(0, 1 - (now - startTime) * 1.0 / duration));
      }
    }, 0);
    e.stopPropagation();
    e.preventDefault();
  }, false);
}

function view_notice(m) {
  $('#ellab-menubar-msg').innerHTML = m;
}

// show the page count besides the page dropdown
function view_show_page_count() {
  var res = xpathl('//select[@name="page"]');
  if (res.snapshotLength > 0) {
    var currPage = xpath('//select[@name="page"]/option[@selected]').value;
    var lastPage = res.snapshotItem(i).getElementsByTagName('option')[res.snapshotItem(i).getElementsByTagName('option').length - 1].value;
    for (var i=0; i<res.snapshotLength; i++) {
      var select = res.snapshotItem(i);
      var a = document.createElement('a');
      a.innerHTML = lastPage;
      a.className = 'ellab-last-page';
      /*jshint scripturl:true */
      a.href = 'javascript:changePage(' + lastPage + ')';
      /*jshint scripturl:false */
      select.parentNode.insertBefore(a, select.nextSibling);
      var t = document.createTextNode(' / ');
      select.parentNode.insertBefore(t, a);

    }
    meta('curr-page', currPage);
    meta('last-page', lastPage);
  }
}

function view_add_golden_show_link() {
  xpathl('//select[@name="page"]').each(function() {
    var a = document.createElement('a');
    a.href = meta('golden-show-url');
    a.target = '_blank';
    a.innerHTML = 'GoldenShow';
    a.setAttribute('class', 'ellab-goldenshow-link');
    this.parentNode.appendChild(a);
  });
}

// show '5 minutes ago', '9 hours ago' besides timestamp
function view_smart_timestamp() {
  utils.each(g_threads, function() {
    var span = this.timestampNode;
    if (span && span.getElementsByClassName('ellab-timestamp').length === 0) {
      // if not already has insert the smart timestamp tag
      if (span.textContent) {
        span.innerHTML += ' (<span class="ellab-timestamp" fromtime="' + span.textContent + '"></span>)';
      }
    }
  });

  view_update_smart_timestamp();
}

function view_update_smart_timestamp() {
  var maxtime;
  xpathl('//span[contains(concat(" ", @class, " "), " ellab-timestamp ")]').each(function() {
    var timestamp = this.getAttribute('fromtime');
    if (timestamp) {
      var time = moment(timestamp, this.getAttribute('timefmt') || guess_time_format(timestamp));
      if (typeof maxtime === 'undefined' || maxtime.diff(time) < 0) {
        maxtime = time;
      }
      var strfmt = this.getAttribute('strfmt');
      if (strfmt) {
        this.innerHTML = strfmt.replace('%s', time.fromNow());
      }
      else {
        this.innerHTML = time.fromNow();
      }
    }
  });

  // show idle icon
  if (g_options.idle > 0) {
    if (meta_int('curr-page') == meta_int('last-page')) {
      if (maxtime) {
        debug('latest message timestamp ' + maxtime.format());
      }

      if (maxtime && moment().diff(maxtime) >= g_options.idle) {
        // two hour old
        debug('no more message for ' + (g_options.idle / 1000) + ' seconds');
        change_favicon('NO_MESSAGE');
      }
    }
  }
}

// remove empty row caused by ad blocker
function view_remove_ad_empty_row() {
  xpathl('//div[@id="ctl00_ContentPlaceHolder1_view_form"]/div/table').each(function() {
    if ((this.innerHTML.indexOf('HKGTopGoogleAd') >= 0 && this.innerHTML.toUpperCase().indexOf('<SPAN ID="HKGTOPGOOGLEAD">') >= 0) ||
        (this.innerHTML.indexOf('MsgInLineAd') >= 0 && this.innerHTML.toUpperCase().indexOf('<SPAN ID="MSGINLINEAD') > 0)) {
      this.style.display = 'none';
    }
  });
}

function view_clean_content() {
  // remove show_ads.js
  $e('table.repliers', function() {
    $e('script[src*="show_ads.js"], iframe[src*="yahoo_ad.aspx"]', function() {
      utils.removeChild(utils.parent(this, 'table'));
    }, null, this);
  });
}

function view_clean_layout() {
  // make the notice box on the top smaller
  // golden.css to hide the title and only show the first line of body text (<strong/>)
  // to put the title in front fo the first line, and make the <strong/> a link to expand the body
  $e('.DivResizableBoxContainer', function() {
    var title = $1('.DivResizableBoxTitle div', this).innerHTML.replace('class="BoxTitleLink"', '');
    $e('.DivResizableBoxDetails > strong', function() {
      this.innerHTML = title + ' : <a data-ellab="expand-notice" class="novisited" href="#">' + this.innerHTML + '</a>';
      $1('a[data-ellab="expand-notice"]', this).addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        e.target.parentNode.parentNode.style.height = 'auto';
      }, false);
    }, null, this);
  });

  // clean up the
  // span#ctl00_ContentPlaceHolder1_lb_UserName 現有會員可[按此]登入。
  // span#ctl00_ContentPlaceHolder1_lb_CompanyMode [公司模式-開] [懷舊模式-關] [大字型] [小字型]
  // br br
  // 您現在聚腳在 非會員伺服器 XX台內。br
  // a#ctl00_ContentPlaceHolder1_changeLink1 [轉到會員伺服器]  [轉到海外伺服器]

  // remove the second <br> of the "<br><br>"
  $e('br + br', function() {
    utils.removeChild(this);
  }, null, $('#ctl00_ContentPlaceHolder1_lb_CompanyMode').parentNode);

  // remove the <br> preceeding #ctl00_ContentPlaceHolder1_lb_CompanyMode and #ctl00_ContentPlaceHolder1_changeLink1
  $e('#ctl00_ContentPlaceHolder1_lb_CompanyMode, #ctl00_ContentPlaceHolder1_changeLink1', function() {
    utils.removeChild(utils.prevSibling(this, 'br'));
  });

  view_clean_content();
}

// setup the timer to check more replies
function view_check_more() {
  if (meta('curr-page') !== meta('last-page')) return;

  utils.crossOriginXMLHttpRequest({
    url: document.location.href,
    method: 'get',
    onload: function(response) {
      view_check_more_check_content(response.responseText);
    }
  });
}

// show the additional replies or message of new page
function view_check_more_check_content(t) {
  var parsed = view_parse_ajax(t);
  var i;
  var maxId = -1;
  var res = t.match(/href="post\.aspx\?mt=Y&rid=\d+/g);
  if (res) {
    for (i=0;i<res.length;i++) {
      var res2 = res[i].match(/rid=(\d+)/);
      if (res2) {
        var id = parseInt(res2[1], 10);
        if (!isNaN(id) && id > maxId) {
          maxId = id;
        }
      }
    }
  }
  debug('view_check_more_check_content last thread id read from ajax=' + maxId);
  var currThread = meta_int('curr-thread', -1);
  debug('view_check_more_check_content currThread=' + currThread);
  var threadNo = meta_int('thread-no', -1);
  var noticeMsg = '';
  // for testing only, replace the below line.  If force to have new message
  //if (true || maxId > 0 && maxId > currThread) { threadNo = g_threads[0].threadId; currThread = g_threads[0].threadId;
  if (maxId > 0 && maxId > currThread) {
    var newThreads = utils.grep(parsed.threads, function() { return this.node && this.threadId > threadNo; });
    if (maxId > threadNo) {
      document.title = '(' + (newThreads.length) + ') ' + meta('title');
      noticeMsg = (newThreads.length) + ' 個新回覆';
      debug((newThreads.length) + ' more messages');
      change_favicon('NEW_MESSAGE');
    }

    // auto show new msg, skip those already shown
    newThreads = utils.grep(parsed.threads, function() { return this.node && this.threadId > currThread; });
    utils.each(newThreads, function() {
      // remove script tags (most for ad)
      utils.each(this.node.getElementsByTagName['script'], function() { utils.removeChild(this); });
      utils.addClass(this.node, 'ellab-new-reply');
      utils.insertAfter(this.node, g_lastThreadNode);
      g_lastThreadNode = this.node;
      g_threads.push(this);
    });
    meta('curr-thread', maxId);

    view_on_new_thread_load();
  }

  if (parsed.hasNext) {
    debug('has more pages');
    noticeMsg += (noticeMsg?'&nbsp;&nbsp;&nbsp;':'') + '新一頁';
    if (document.title == meta('title')) {
      document.title = '(新一頁) ' + meta('title');
    }
    $('#ellab-next-bar').style.display = '';
    if (parsed.lastPage) {
      $e('.ellab-last-page', function() {
        this.innerHTML = parsed.lastPage;
      });
    }
    change_favicon('NEW_MESSAGE');
  }

  if (noticeMsg) {
    view_notice(noticeMsg);
  }
}

// construct the prev and next bar on the both side of the page to ease the navigation
function view_prevnextbar() {
  var prev = document.createElement('div');
  prev.setAttribute('id', 'ellab-prev-bar');
  prev.className = 'ellab-prevnext-bar';
  document.body.appendChild(prev);

  var next = document.createElement('div');
  next.setAttribute('id', 'ellab-next-bar');
  next.className = 'ellab-prevnext-bar';
  document.body.appendChild(next);

  var pageWidthContainer = xpath('//div[@id="PageMiddlePanel"]/div[@class="PageWidthContainer"]');
  if (pageWidthContainer) {
    var left = utils.calcOffsetLeft(pageWidthContainer);
    left -= 5;
    left = Math.max(left, 50);
    prev.style.width = left + 'px';
    next.style.width = left + 'px';
  }

  function p_prev_page() {
    utils.inject('changePage(' + (meta_int('curr-page', 2) - 1) + ')');
  }

  function p_next_page() {
    utils.inject('changePage(' + (meta_int('curr-page', 0) + 1) + ')');
  }

  prev.addEventListener('click', p_prev_page, false);
  next.addEventListener('click', p_next_page, false);

  if (meta_int('curr-page', 0) <= 1) {
    prev.style.display = 'none';
  }
  if (meta_int('curr-page', 0) == meta_int('last-page', 0)) {
    next.style.display = 'none';
  }

  document.addEventListener('mousewheel', function(e) {
    if (g_options.wheel == 'true') {
      if (e.wheelDeltaX > 0) {
        // left
        if (prev.style.display != 'none') {
          p_prev_page();
        }
      }
      else if (e.wheelDeltaX < 0) {
        // right
        if (next.style.display != 'none') {
          p_next_page();
        }
      }
    }
  });

  new utils.ProgressHoverIntent(prev, {
    text: '上一頁',
    done: p_prev_page,
    left: 20,
    topOffset: -40
  });
  new utils.ProgressHoverIntent(next, {
    text: '下一頁',
    done: p_next_page,
    right: 20,
    topOffset: -40
  });
}

function view_parse_thread_list(doc) {
  var threads = [];
  $e('img[src="images\/quote.gif"]', function() {
    var node = utils.parent(this, function() { return Sizzle.matchesSelector(this, 'table.repliers'); });
    if (node) {
      var tr = node.rows[node.rows.length - 1];
      var nodeId = tr.getAttribute('id');
      var userId = tr.getAttribute('userid');
      var username = tr.getAttribute('username');
      var threadId = this.parentNode.getAttribute("href");
      threadId = threadId?threadId.match(/rid=(\d+)/):null;
      threadId = threadId?threadId[1]:null;
      var isFirstPost = threadId == 1;

      // the actual thread node is the container table
      if (utils.parent(node, 'td', true) !== null) {
        // the first thread (the original post) is different
        // div
        //   table.repliers
        //     { first post }
        //   table tr td
        //     table.repliers
        //       { reply }
        //   table tr td
        //     table.repliers
        //       { reply }
        node = utils.parent(node, 'table');
      }

      if (doc) {
        node = node.cloneNode(true);
      }

      var timestamp;
      var timespan = $1('.repliers_right tr:last-child > td > div:last-child span:not([id]):last-child', node);
      if (timespan && timespan.textContent) {
        timestamp = moment(timespan.textContent, guess_time_format(timespan.textContent));
      }

      // if pass a doc, clone the node
      threads.push({
        isFirstPost: isFirstPost,
        threadId: threadId,
        userId: userId,
        username: username,
        nodeId: nodeId,
        node: node,
        timestamp: timestamp,
        timestampNode: timespan
      });
    }
  }, null, doc);

  return threads;
}

function view_parse_ajax(t, nodom) {
  var title = view_parse_ajax_title(t);
  var hasPrev = t.indexOf('src="images/button-prev.gif"') > 0;
  var hasNext = t.indexOf('src="images/button-next.gif"') > 0;
  var lastPage;

  // get the total page number
  lastPage = utils.extract(t, 'onchange="javascript: changePage( value )"', '</select>');
  if (lastPage) {
    var lastPageRes = lastPage.match(/>(\d+)<\/option>/g);
    if (lastPageRes) {
      lastPage = lastPageRes[lastPageRes.length - 1].match(/\d+/)[0];
    }
    else {
      lastPage = null;
    }
  }

  var threads = null;
  if (!nodom) {
    var doc = createDocument(t);
    threads = view_parse_thread_list(doc);
  }

  return {
    threads: threads,
    title: title,
    hasPrev: hasPrev,
    hasNext: hasNext,
    lastPage: lastPage
  };
}

function view_parse_ajax_title(t) {
  return utils.trim(utils.extract(t, '<Attribute name="title">', '</Attribute>') || utils.extract(t, '<title>', '</title>'));
}


// 1. show the title of other golden message
// 2. open golden meesage link in new tab
// 3. change link to current server so don't need to login again
function view_golden_message_link() {
  function p_view_golden_message_link_add_queue(a) {
    var url = a.href;
    // get the first page for the post time
    if (url.match(/&page=\d+/)) {
      url = url.replace(/&page=\d+/, '&page=1');
    }
    else {
      url += '&page=1';
    }
    g_ajaxQueue.push({url:url, callback: p_view_golden_message_link_worker, args:a});
  }

  // show the title of other golden message
  function p_view_golden_message_link_worker(response, a) {
    var parsed = view_parse_ajax(response.responseText);
    if (parsed) {
      a.innerHTML += ' ' + parsed.title;
      if (parsed.threads && parsed.threads.length > 0 && parsed.threads[0].isFirstPost && parsed.threads[0].timestamp) {
        var span = document.createElement('span');
        span.className = 'ellab-inline-timestamp ellab-timestamp';
        span.setAttribute('strfmt', moment(parsed.threads[0].timestamp).lang('en').format(GOLDEN_TIMEFMT) + ' (%s)');
        span.setAttribute('fromtime', moment(parsed.threads[0].timestamp).lang('en').format(GOLDEN_TIMEFMT));
        utils.insertAfter(span, a);
        view_update_smart_timestamp();
      }
    }
  }

  xpathl('//a[contains(@href, "hkgolden.com/view.aspx") and not(contains(@id, "changeLink"))]').each(function() {
    var parsed = parse_view_url(this.href);
    if (parsed.msgId && parsed.forum) {
      if (parsed.msgId != meta('msg-id')) {
        // other message, show title and open in new window
        p_view_golden_message_link_add_queue(this);
        this.target = '_blank';
      }
      if (parsed.forum != meta('server')) {
        // change to current server
        this.href = this.href.replace(/^http\:\/\/forum\d+\.hkgolden\.com\//, 'http://forum' + meta('server') + '.hkgolden.com/');
        this.innerHTML = this.innerHTML.replace(/http\:\/\/forum\d+\.hkgolden\.com\//, 'http://forum' + meta('server') + '.hkgolden.com/');
      }
    }
  });
}

function view_expand_youtube() {
  function p_view_expand_youtube_load_video_data(spanTitle, spanTimestamp, vid) {
    utils.crossOriginXMLHttpRequest({
      method: 'get',
      url: 'https://gdata.youtube.com/feeds/api/videos/' + vid + '?v=2',
      onload: function(response) {
        var xml = utils.parseXML(response.responseText);
        if (xml) {
          var timestamp = xml.getElementsByTagName('entry')[0].getElementsByTagName('published')[0].textContent;
          spanTitle.innerHTML = utils.encodeHTML(xml.getElementsByTagName('entry')[0].getElementsByTagName('title')[0].textContent);
          spanTimestamp.setAttribute('strfmt', moment(timestamp, spanTimestamp.getAttribute('timefmt')).lang('en').format(GOLDEN_TIMEFMT) + ' (%s)');
          spanTimestamp.setAttribute('fromtime', timestamp);
          view_update_smart_timestamp();
        }
      }
    });
  }

  // convert youtube text to link, but not working
  // $e('tr[id^="Thread_No"] table.repliers_right td:first-child', function() {
  //   html = html.replace(/https?\:\/\/(www\.)?youtube\.com\/watch\?v\=([a-zA-Z0-9\-]+)([a-zA-Z0-9\&%_\.\/\-~]*)/, function(match, contents, offset, s) {
  //     console.log(match);
  //     return '';
  //   });
  // });

  xpathl('//a[(contains(@href, "youtube.com/watch?v=") or contains(@href, "youtu.be/")) and not(@ellab-expanded)]').each(function() {
    var res = this.href.match(/^https?\:\/\/(www\.)?youtube\.com\/watch\?v\=([^\&]+)/);
    if (!res) {
      res = this.href.match(/^https?\:\/\/(m\.)?youtube\.com\/watch\?v\=([^\&]+)/);
    }
    if (!res) {
      res = this.href.match(/^https?\:\/\/(www\.)?youtu\.be\/([a-zA-Z0-9]+)/);
    }
    if (res) {
      this.setAttribute('ellab-expanded', true);

      var vid = res[2];

      // append place holder for the youtube title and timestamp
      var spanTitle = document.createElement('span');
      spanTitle.className = 'ellab-youtube-title';
      spanTitle.setAttribute('ellab-youtube-vid', vid);
      utils.insertAfter(spanTitle, this);
      var spanTimestamp = document.createElement('span');
      spanTimestamp.className = 'ellab-inline-timestamp ellab-timestamp';
      spanTimestamp.setAttribute('ellab-youtube-vid', vid);
      spanTimestamp.setAttribute('timefmt', 'YYYY-MM-DDTHH:mm:ss.SSSz');
      utils.insertAfter(spanTimestamp, spanTitle);
      // call youtube api to get the data
      p_view_expand_youtube_load_video_data(spanTitle, spanTimestamp, vid);

      var div = document.createElement('div');
      div.setAttribute('ellab-youtube-vid', vid);
      div.className = 'ellab-youtube';

      div.addEventListener('click', function(e) {
        if (e.target.tagName.toLowerCase() === 'img') {
          // only effective when click the thumbnail
          if ((option_equal('youtube', 0) || option_equal('youtube', 1)) && this.innerHTML.indexOf('iframe') < 0) {
            this.innerHTML = '<iframe width="560" height="315" src="http://www.youtube.com/embed/' + this.getAttribute('ellab-youtube-vid') + '" frameborder="0" allowfullscreen></iframe>';
          }
        }
      }, false);

      utils.insertAfter(div, spanTimestamp);
    }
  });

  on_options_value_changed('youtube');
}

function view_expand_youtube_enabler() {
  $e('div[ellab-youtube-vid]', function() {
    if (option_equal('youtube', 0) || option_equal('youtube', 1)) {
      this.innerHTML = '<img src="http://img.youtube.com/vi/' + this.getAttribute('ellab-youtube-vid') + '/' + g_options.youtube + '.jpg"/>';
      this.style.display = '';
    }
    else if (g_options.youtube == 'video') {
      this.innerHTML = '<iframe width="560" height="315" src="http://www.youtube.com/embed/' + this.getAttribute('ellab-youtube-vid') + '" frameborder="0" allowfullscreen></iframe>';
      this.style.display = '';
    }
    else {
      this.innerHTML = '';
      this.style.display = 'none';
    }
  });
}

function view_favicon() {
  if (meta_int('curr-page') != meta_int('last-page')) {
    change_favicon('NEW_MESSAGE');
  }
  else {
    change_favicon('GOLDEN_ICON');
  }
}

function view_story_mode() {
  if (g_threads.length > 0 && g_threads[0].isFirstPost && g_threads[0].userId) {
    var userId = g_threads[0].userId;

    var cachedStoryCount = get_cache(view_story_mode_get_cache_key('count', userId));
    var cachedStoryLastPage = get_cache(view_story_mode_get_cache_key('lastpage', userId));

    utils.each(utils.grep(g_threads, function() { return this.userId === userId; }), function() {
      var div = document.createElement('div');
      div.className = 'ellab-story-mode-btn';
      div.innerHTML = '<a href="#" data-role="story-mode-view" data-userid="' + userId + '">睇故模式</a>';
      if (cachedStoryLastPage) {
        var divMsg = document.createElement('div');
        divMsg.innerHTML = 'cache: ' + cachedStoryLastPage + ' 頁 (' +
                           '<a href="#" data-role="story-mode-clear-cache" data-userid="' + userId + '">清除</a>)';
        meta('story-lastpage', cachedStoryLastPage);
        div.appendChild(divMsg);
      }
      $1('.repliers_left', this.node).appendChild(div);
    });
  }

  $e('[data-role="story-mode-view"]', function() {
    this.addEventListener('click', function(e) {
      view_story_mode_click(e.target.getAttribute('data-userid'));
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  $e('[data-role="story-mode-clear-cache"]', function() {
    this.addEventListener('click', function(e) {
      for (var i=1 ; i<=41 ; i++) {
        remove_cache(view_story_mode_get_cache_key('page', e.target.getAttribute('data-userid'), i));
      }
      remove_cache(view_story_mode_get_cache_key('count', e.target.getAttribute('data-userid')));
      remove_cache(view_story_mode_get_cache_key('lastpage', e.target.getAttribute('data-userid')));
      document.location.reload();
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });
}

function view_story_mode_get_cache_key(type, userId, page) {
  if (type === 'page') {
    return 'storymode-v1-' + meta('msg-id') + '-' + userId + '-' + page;
  }
  else if (type === 'count' || type === 'lastpage') {
    return 'storymode-v1-' + meta('msg-id') + '-' + userId + '-' + type;
  }
}

function view_story_mode_click(userId) {
  // hide the unrelated threads in current page first;
  $e('tr[userid][userid!="' + userId + '"]', function() {
    var parentTable = utils.parent(utils.parent(this, 'table'), 'table');
    if (parentTable) {
      parentTable.parentNode.removeChild(parentTable);
    }
  });

  remove_cache(view_story_mode_get_cache_key('count', userId));

  // hide the prev/next bar
  $e('.ellab-prevnext-bar', function() { this.style.display = 'none'; });

  // start getting next page
  view_story_mode_page(userId, meta_int('curr-page') + 1);
}

function view_story_mode_page(userId, page) {
  view_notice('睇故模式 ﹣ 正在讀取第 ' + page + ' 頁');

  var cacheKey = view_story_mode_get_cache_key('page', userId, page);

  var cachedItem = get_cache(cacheKey);
  var cacheIsGood = false;
  if (cachedItem) {
    debug('hit cache on page ' + page);

    cacheIsGood = true;
    if (cachedItem.textz) {
      var parsed = view_parse_ajax(Base64.btou(RawDeflate.inflate(cachedItem.textz)));
      if (parsed) {
        parsed.hasNext = cachedItem.hasNext;
        if (!view_story_mode_page_check_content(userId, page, parsed)) {
          // can't locate content but suppose to have, mainly due to page HTML changed but cache old HTML
          cacheIsGood = false;
        }
      }
      else {
        // can't parse, the cache is corrupted
        cacheIsGood = false;
      }
    }
  }

  // get from server again if not cached, or cached but cannot recognize
  if (cacheIsGood) {
    // cachedItem.hasNext should be always true, we won't cache the last page
    set_cache(view_story_mode_get_cache_key('lastpage', userId), page);
    view_story_mode_page(userId, page + 1);
    return;
  }

  var url = document.location.href;
  // append page to # means nothing
  url = url.replace(/#.*$/, '');
  if (url.match(/[\?|&]page=/)) {
    url = url.replace(/page=\d+/, 'page=' + page);
  }
  else {
    url += '&page=' + page;
  }

  debug('view_story_mode_page url=' + url);
  utils.crossOriginXMLHttpRequest({
    url: url,
    method: 'get',
    onload: function(response) {
      var parsed = view_parse_ajax(response.responseText);
      if (!parsed) {
        return;
      }

      var addedHTML = view_story_mode_page_check_content(userId, page, parsed);

      if (addedHTML) {
        if (page == meta_int('story-lastpage', -1) + 1) {
          var scrollTo = utils.calcOffsetTop(utils.prevSibling($1('.ellab-new-reply').parentNode, 'div')) - $('#ellab-menubar').clientHeight;
          animate_scroll_to(scrollTo, 500);
        }
      }

      if (parsed.hasNext) {
        // set cache
        if (lscache) {
          // we won't cache the last page
          // also won't cache the text content if no thread is added for this page, to save space
          debug('set cache:' + cacheKey);
          set_cache(cacheKey, { textz:RawDeflate.deflate(Base64.utob(addedHTML)), hasNext:true });
          set_cache(view_story_mode_get_cache_key('lastpage', userId), page);
        }

        // sleep for a while, seems will be blocked if too much requests
        window.setTimeout(function() {
          view_story_mode_page(userId, page + 1);
        }, AJAX_WAIT);
      }
      else {
        view_notice('睇故模式 ﹣ 完成讀取 ' + page + ' 頁');
        meta('story-lastpage', page);
      }
    }
  });
}

// return the appended HTML, null/"" if no thread is appended
function view_story_mode_page_check_content(userId, page, parsed) {
  var parentTable = utils.parent($1('table.repliers'), 'div');
  if (!parentTable) {
    return null;
  }

  var stories = utils.grep(parsed.threads, function() { return this.userId == userId; });
  debug(stories.length + ' stories found');
  var cacheCountKey = view_story_mode_get_cache_key('count', userId);
  set_cache(cacheCountKey, get_cache(cacheCountKey, 0) + stories.length);

  var divDest = document.createElement('div');
  utils.each(stories, function(i) {
    if (i === 0) {
      var divPageNum = document.createElement('div');
      divPageNum.innerHTML = '<a href="javascript:changePage(' + page + ')">第 ' + page + ' 頁</a>';
      parentTable.parentNode.insertBefore(divPageNum, $1('#newmessage'));
    }
    divDest.appendChild(this.node);
    g_threads.push(this);
  });

  // need to store the HTML otherwise the HTML will include the new ellab-new-reply
  var addedHTML = divDest.innerHTML;

  if (page >= meta_int('story-lastpage', 0)) {
    utils.each(stories, function() {
      utils.addClass(this.node, 'ellab-new-reply');
    });
  }

  parentTable.parentNode.insertBefore(divDest, $1('#newmessage'));
  view_on_new_thread_load();

  return addedHTML;
}

function view_on_new_thread_load() {
  view_clean_content();
  view_smart_timestamp();
  view_expand_youtube();
}

function topics() {
  var starttime, time;
  starttime = time = performance('topics');
  menubar('topics');
  time = performance('topics_menubar', time);
  topics_remove_ad_empty_row();
  time = performance('topics_remove_ad_empty_row', time);
  //topics_add_golden_show_link();
  //time = performance('topics_add_golden_show_link', time);
  topics_open_link_new_window();
  time = performance('topics_open_link_new_window', time);
  topics_disable_sensor();
  time = performance('topics_disable_sensor', time);
  topics_message_history()
  time = performance('topics_message_history', time);
  //topics_opened_tabs();
  //time = performance('topics_opened_tabs', time);
  //window.setInterval(function() {
  //  topics_opened_tabs();
  //}, 10000);

  change_favicon('GOLDEN_ICON');

  if (DEBUG) {
    xpathl('//div[@id="ctl00_ContentPlaceHolder1_view_form"]/div').each(function(i) {
      this.setAttribute('ellab-debug-div', i);
    });
  }

  performance('complete', starttime);
}

function view() {
  var starttime, time;
  starttime = time = performance('view');
  view_onready();
  time = performance('view_onready', time);
  menubar('view');
  time = performance('view_menubar', time);
  view_show_page_count();
  time = performance('view_show_page_count', time);
  view_prevnextbar();
  time = performance('view_prevnextbar', time);
  view_favicon();
  time = performance('view_favicon', time);
  view_remove_ad_empty_row();
  time = performance('view_remove_ad_empty_row', time);
  try { view_clean_layout(); } catch (ex) { error(ex); }
  time = performance('view_clean_layout', time);
  //view_add_golden_show_link();
  //time = performance('view_add_golden_show_link', time);
  view_golden_message_link();
  time = performance('view_golden_message_link', time);
  view_expand_youtube();
  time = performance('view_expand_youtube', time);
  view_smart_timestamp();
  time = performance('view_smart_timestamp', time);
  view_check_more();
  time = performance('view_check_more', time);
  view_story_mode();
  time = performance('view_story_mode', time);

  window.setInterval(function() {
    view_update_smart_timestamp();
    view_check_more();
  }, 60000);

  performance('complete', starttime);
}

function init() {
  // detect if blur.css is included, there is a rule in blur.css: div.blurdetect { opacity: 0.024; }
  var blurdetect = document.createElement('div');
  blurdetect.className = 'blurdetect';
  document.body.appendChild(blurdetect);
  g_is_blur = (window.getComputedStyle(blurdetect, null).getPropertyValue('opacity') - 0.024 < 0.00001);
  document.body.removeChild(blurdetect);
  blurdetect = null;

  if (lscache) {
    lscache.setBucket('better-golden');
  }

  if (document.location.href.match(/topics\.aspx/) ||
      document.location.href.match(/topics_.*\.htm/)) {
    topics();
  }
  else if (document.location.href.match(/view\.aspx/)) {
    view();
  }

  on_options_value_changed('blur');
  on_options_value_changed('collapsequickreply');

  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
      on_options_changed(changes);
    }
  });

  ajax_queue_worker();
}

if (document.location.href.match(/topics\.aspx/) ||
    document.location.href.match(/topics_.*\.htm/) ||
    document.location.href.match(/view\.aspx/))
{
  chrome.extension.sendMessage({msgId: 'get_options'}, function(response) {
    g_options = response.options;
    init();
  });
}

})();
