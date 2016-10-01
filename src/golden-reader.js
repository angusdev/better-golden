/*jshint white: false, browser: true, onevar:false */
/*global chrome, console, org, moment, lscache, Sizzle, RawDeflate, Base64 */
(function() {
'use strict';

var g_message_hist = {};
var g_type = '';
var g_first_message = null;

function encode_html(s) {
  if (s) {
    s = s.replace('&', '&amp;', 'g');
    s = s.replace('>', '&gt;', 'g');
    s = s.replace('<', '&lt;', 'g');
    s = s.replace('"', '&quot;', 'g');
  }
  return s;
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
  xhr.send();
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

function get_toc(type, page, loadedMessageList, background) {
  loadedMessageList = loadedMessageList || {};

  ajax({
    url: 'http://apps.hkgolden.com/iphone_api/v1_2/newTopics.aspx?type=' + type + '&page=' + page + '&returntype=json&pagesize=18&filtermode=Y&user_id=0&block=Y&sensormode=Y',
    onload: function(response) {
      console.log(new Date(), "Loaded " + type + " " + page);
      try {
        var json = JSON.parse(response.responseText);
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
            for (var i=0 ; !hist1hr && i<3600 ; i+=300) {
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
              html += '<tr' + (loaded?' style="color: red !important;"':'') + '><td>' + page +
                '</td><td><a href="http://forum14.hkgolden.com/view.aspx?type=' + type +
                '&message=' + v.Message_ID + '&sensormode=N" target="_blank">' + encode_html(v.Message_Title) +
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
              document.getElementById('toc_body').innerHTML = '';
            }
            document.getElementById('toc_body').innerHTML += html;
          }

          console.log(new Date(), "Finish " + type + " " + page);
          if (page >= 5) {
            var objectToStore = {};
            var storageKey = 'message_history_' + g_type;
            objectToStore[storageKey] = g_message_hist;
            chrome.storage.local.set(objectToStore, function() {
              console.log(new Date(), "Saved " + type + " " + page);
              window.setTimeout(function() { get_toc(type, 1, loadedMessageList, true);}, 30000);
            });
            return;
          }
          else {
            get_toc(type, ++page, loadedMessageList, background);
          }
        }
      }
      catch (err) {
        console.log(err);
      }
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
    g_type = document.location.hash.substring(1);
    var typename = $('[data-role="type-dropdown"] a[data-type="' + g_type + '"]').html();
    $('[data-role="typename"]').html(typename?('(' + typename + ')'):'');
    chrome.storage.local.get('message_history_' + g_type, function(result) {
      g_message_hist = result['message_history_' + g_type] || {};
      housekeep();

      get_toc(g_type, 1);
    });
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
