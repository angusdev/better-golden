/*jshint white: false, browser: true, onevar:false */
/*global chrome, console, org, moment, lscache, Sizzle, RawDeflate, Base64 */
(function() {
'use strict';

var g_message_hist = {};
var g_type = '';
var g_first_message = null;

var PAGE_SIZE = 50;

var g_curr_page = 1;

var g_detect_scroll;

function encode_html(s) {
  if (s) {
    s = s.replace('&', '&amp;', 'g');
    s = s.replace('>', '&gt;', 'g');
    s = s.replace('<', '&lt;', 'g');
    s = s.replace('"', '&quot;', 'g');
  }
  return s;
}

function ajax_get_topics(type, page, callback) {
  ajax({
    url: 'http://ellab.org/hkgolden/hkgoldenapi?t=' + type + '&s=' + page,
    onload: function(response) {
      try {
        var json = JSON.parse(response.responseText);
        callback.call(this, json);
      }
      catch (err) {
        console.log('ajax_get_topics error', err);
      }
    }
  });
}

function ajax_get_message(message, start, callback) {
  ajax({
    url: 'http://ellab.org/hkgolden/hkgoldenapi?m=' + message + '&s=' + start,
    onload: function(response) {
      try {
        var json = JSON.parse(response.responseText);
        callback.call(this, json);
      }
      catch (err) {
        console.log('ajax_get_message error', err);
      }
    }
  });
}

function ajax(params) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if (xhr.status == 200) {
        var response = {status:xhr.status, responseText:xhr.responseText};
        if (params.onload) {
          params.onload.call(this, response);
        }
      }
    }
  };

  xhr.open(params.method || 'GET', params.url, true);
  var postData = null;
  if ('POST' === params.method && params.data) {
    xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    if (typeof params.data === 'string') {
      postData = params.data;
    }
    else {
      postData = '';
      for (var k in params.data) {
        postData += (postData?'&':'') + k + '=' + encodeURIComponent(params.data[k]);
      }
    }
  }

  xhr.send(postData);
}

function DetectScroll(callback) {
  var _instance = this;
  this._enable = false;

  this._callback = callback;

  this.enable = function() {
    this._enable = true;
  };

  this.disable = function() {
    this._enable = false;
  };

  window.addEventListener('scroll', function() {
    if (_instance._enable && _instance._callback) {
      var st = Math.max(document.documentElement.scrollTop, document.body.scrollTop);
      if (st <= 0) {
        _instance._callback.call(window, 'top');
      }
      else if ((st + document.documentElement.clientHeight) >= document.documentElement.scrollHeight - 1) {
        _instance._callback.call(window, 'bottom');
      }
    }
  }, false);
}

function pad_zero(n) {
  return n<10?('0'+n):n;
}

function format_time_key(d, offset) {
  if (offset) {
    d = new Date(d.getTime() - offset * 1000);
  }
  return '' + d.getFullYear() +
    pad_zero(d.getMonth() + 1) +
    pad_zero(d.getDate()) +
    pad_zero(d.getHours()) +
    pad_zero(parseInt(d.getMinutes() / 15, 10) * 15);
}

function format_time_display(d) {
  return pad_zero(d.getMonth() + 1) + '-' +
    pad_zero(d.getDate()) + ' ' +
    pad_zero(d.getHours()) + ':' +
    pad_zero(d.getMinutes());
}

function from_now(obj) {
  var time = obj;
  if (typeof obj === 'string') {
    time = parseInt(obj, 10);
  }
  else if (typeof obj === 'object' && obj.getTime) {
    time = obj.getTime();
  }
  var now = new Date();
  obj = new Date(time);
  var diff = (now.getTime() - time) / 1000;
  if (diff < 60) {
    return diff + 's';
  }
  else if (diff < 60 * 60) {
    return parseInt(diff / 60, 10) + 'm';
  }
  else if (diff < 60 * 60 * 24) {
    return parseInt(diff / 60 / 60, 10) + 'h';
  }
  else {
    var thisYearMonth = now.getFullYear() * 12 + now.getMonth();
    var thatYearMonth = obj.getFullYear() * 12 + obj.getMonth();
    if (thisYearMonth === thatYearMonth ||
        (thisYearMonth === thatYearMonth + 1 && now.getDate() < obj.getDate())) {
      // same month, or last month but less than 1 month diff
      return parseInt(diff / 60 / 60 / 24, 10) + 'd';
    }
    else {
      return (thisYearMonth - thatYearMonth) + 'mon';
    }
  }
}

function get_toc(type, page, loadedMessageList, background) {
  $('#topics-container').show();

  loadedMessageList = loadedMessageList || {};

  ajax_get_topics(type, page, function(json) {
    console.log(new Date(), 'Loaded ' + type + ' ' + page);
    try {
      if (json.success) {
        var html = '';
        json.topic_list.forEach(function(v, i) {
          if (background) {
            if (page === 1 && i === 0 && g_first_message && (g_first_message.Message_ID != v.Message_ID || g_first_message.Total_Replies != v.Total_Replies)) {
              $('[data-role="hasupdate"]').show();
            }
          }
          else if(g_first_message === null) {
            g_first_message = v;
          }

          var loaded = false;
          if (loadedMessageList['M' + v.Message_ID]) {
            loaded = true;
            //return true;
          }
          else {
            loadedMessageList['M' + v.Message_ID] = true;
          }

          //var date = new Date(parseInt(v.Last_Reply_Date.match(/\d+/)[0], 10));
          var date = new Date();
          var timekey = format_time_key(date);

          var m = g_message_hist['M_' + v.Message_ID];
          if (!m) {
            m = {
              msg_id: v.Message_ID,
              title: v.Message_Title,
              author: v.Author_Name,
              hist: {}
            };
            g_message_hist['M_' + v.Message_ID] = m;
          }
          m.hist['T_' + timekey] = { t: timekey, r: v.Total_Replies, a: v.Rating };

          var hist15min, hist1hr, hist2hr, hist6hr, hist24hr;
          hist15min = m.hist['T_' + format_time_key(date, 60 * 15)];
          for (i=0 ; !hist1hr && i<3600 ; i+=300) {
            hist1hr = m.hist['T_' + format_time_key(date, 3600 - i)];
          }
          for (i=0 ; !hist2hr && i<3600 * 2 ; i+=300) {
            hist2hr = m.hist['T_' + format_time_key(date, 3600 * 2 - i)];
          }
          for (i=0 ; !hist6hr && i<3600 * 6 ; i+=300) {
            hist6hr = m.hist['T_' + format_time_key(date, 3600 * 6 - i)];
          }
          for (i=0 ; !hist24hr && i<3600 * 24 ; i+=300) {
            hist24hr = m.hist['T_' + format_time_key(date, 3600 * 24 - i)];
          }

          if (!background) {
            html += '<tr' + (loaded?' style="color: red !important;"':'') + '><td>' +
              '<a href="http://forum14.hkgolden.com/view.aspx?type=' + type + '&message=' + v.Message_ID + '&sensormode=N" target="_blank">' + page + '</a>' +
              '</td><td><a href="' +
              document.location.href + ',' + v.Message_ID +
              '" target="_blank">' + encode_html(v.Message_Title) +
              '</a>';
            var totalPages = Math.ceil(v.Total_Replies/25);
            for (i=2 ; i<=totalPages ; i++) {
              if (totalPages <= 13 || i <=6 || i >= totalPages - 5) {
                html += ' [<a href="http://forum14.hkgolden.com/view.aspx?type=' + type +'&message=' + v.Message_ID + '&page=' + i + '&sensormode=N" target="_blank">' + i + '</a>]';
              }
              else {
                if (totalPages > 13 && i == 7) {
                  html += ' ... ';
                }
              }
            }
            html += '</td><td>' + encode_html(v.Author_Name) +
              '</td><td>' + format_time_display(date) +
              '</td><td>' + v.Total_Replies +
              '</td><td>' + v.Rating +
              '</td><td>' + (hist15min?Math.max(0, v.Total_Replies - hist15min.r):'') +
              '</td><td>' + (hist1hr?Math.max(0, v.Total_Replies - hist1hr.r):'') +
              '</td><td>' + (hist2hr?Math.max(0, v.Total_Replies - hist2hr.r):'') +
              '</td><td>' + (hist6hr?Math.max(0, v.Total_Replies - hist6hr.r):'') +
              '</td><td>' + (hist24hr?Math.max(0, v.Total_Replies - hist24hr.r):'') +
              '</td></tr>';
          }
        });

        if (!background) {
          if (page === 1) {
            document.getElementById('toc-body').innerHTML = '';
          }
          document.getElementById('toc-body').innerHTML += html;
        }

        console.log(new Date(), "Finish " + type + " " + page);
        if (page >= 5) {
          var objectToStore = {};
          var storageKey = 'message_history_' + g_type;
          objectToStore[storageKey] = g_message_hist;
          chrome.storage.local.set(objectToStore, function() {
            console.log(new Date(), "Saved " + type + " " + page);
            //window.setTimeout(function() { get_toc(type, 1, loadedMessageList, true); }, 60000);
          });
          return;
        }
        else {
          window.setTimeout(function() { get_toc(type, ++page, loadedMessageList, background); }, 1000);
        }
      }
    }
    catch (err) {
      console.log(err);
    }
  });
}

function get_message_main(type, message, page) {
  g_curr_page = page;

  $('#message-container').show();
  $('#message-main').html('');

  g_detect_scroll = new DetectScroll(function(pos) {
    if (pos === 'bottom') {
      if (!document.getElementById('loading')) {
        $('#loading-message').html('<div id="loading"><img src="loading.gif" /></div>').show();
        g_detect_scroll.disable();
        get_message(type, message, ++g_curr_page);
      }
    }
  });

  $('#loading-message').html('<div id="loading"><img src="loading.gif" /></div>').show();
  get_message(type, message, page);
}

function get_message(type, message, page) {
  ajax_get_message(message, Math.max(0, page - 1) * PAGE_SIZE, function(json) {
    console.log(new Date(), 'Loaded ' + type + ' ' + message + ' ' + page);
    try {
      if (json.success) {
        var html = '';
        var realPage = (page-1) * 2 + 1;
        if ($('.message-title').length === 0) {
          html += '<div class="message-title">' + json.Message_Title + '</div>';
        }
        for (var i=0 ; i<json.messages.length ; i++) {
          var msg = json.messages[i];
          realPage = i>=25 ? (page*2) : ((page-1)*2+1);
          if (i === 0 || i === 25) {
            if ($('[data-reply-page=' + realPage + ']').length === 0) {
              html += '<div class="reply-page" data-reply-page="' + realPage + '">第 ' + realPage + ' 頁</div>';
            }
          }
          var replyId = message + '-' + page + '-' + (i+1);
          var replyNum = (page - 1) * PAGE_SIZE + i;
          var replyTime = msg.Message_Date?msg.Message_Date.match(/\((\d+)\)/):null;
          replyTime = replyTime?from_now(replyTime[1]):'';
          if ($('[data-reply-id=' + replyId + ']').length === 0) {
            var body = msg.Message_Body;
            body = body.replace(/\&amp;\#(\d+);/g, '&#$1;');
            html += '<div class="message" data-reply-id="' + replyId + '">' +
              '<div class="reply-author"><span class="reply-num">#' + replyNum + '</span> ' +
              msg.Author_Name + (replyTime?' <span class="reply-time">\u00B7 ' + replyTime + '</span>':'')+ '</div>' +
              '<div class="reply-body">' + body + '</div>' +
              '</div>';
            }
        }
        $('#message-main').append($(html));
        var imgs = document.getElementById('message-main').querySelectorAll('img[src^="/"]');
        for (i=0 ; i<imgs.length ; i++) {
          imgs[i].setAttribute('src', 'http://forum' + (parseInt(Math.random() * 10 + 1, 10)) + '.hkgolden.com' + imgs[i].getAttribute('src'));
        }

        if (html && json.messages.length === PAGE_SIZE) {
          $('#loading-message').html('').hide();
        }
        else {
          $('#loading-message').html('頁 ' + realPage + '/' + realPage + ' (' + page + ')');
          --g_curr_page;
          window.scrollTo(0, document.body.scrollHeight - document.documentElement.clientHeight - 30);
        }
        window.setTimeout(function() {
          g_detect_scroll.enable();
        }, 100);
      }
    }
    catch (err) {
      console.log(err);
    }
  });
}

function housekeep() {
  console.log(new Date(), "begin housekeep");
  var housekeepKey = format_time_key(new Date(), 86400 * 2);
  for (var i in g_message_hist) {
    var m = g_message_hist[i];
    for (var j in m.hist) {
      if (m.hist[j].t < housekeepKey) {
        console.log("housekeep: remove history " + m.msg_id + ':' + m.hist[j].t);
        delete m.hist[j];
      }
    }
    if (Object.keys(m.hist).length === 0) {
      console.log("housekeep: remove message " + m.msg_id);
      delete g_message_hist[i];
    }
  }
  console.log(new Date(), "finish housekeep");
}

function onhashchanged() {
  if (document.location.hash) {
    var hash = document.location.hash.substring(1).split(',');
    g_type = hash[0];
    var typename = $('[data-role="type-dropdown"] a[data-type="' + g_type + '"]').html();
    $('[data-role="typename"]').html(typename?('(' + typename + ')'):'');

    if (hash.length >= 2 && hash.length <=3) {
      get_message_main(g_type, hash[1], hash.length === 3?hash.length[2]||1:1);
    }
    else {
      chrome.storage.local.get('message_history_' + g_type, function(result) {
        g_message_hist = result['message_history_' + g_type] || {};
        housekeep();

        get_toc(g_type, 1);
      });
    }
  }
  else {
    window.location.hash = 'CA';
  }
}

$(document).ready(function() {
  window.addEventListener("hashchange", onhashchanged, false);
  $('[data-role="type-dropdown"] a').click(function(e) {
    window.location.hash = this.getAttribute('data-type');
    e.preventDefault();
  });

  onhashchanged();
});

})();
