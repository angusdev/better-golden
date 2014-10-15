var storage = chrome.storage.local;
var g_options = {};

var DEBUG = false;
function debug(m) {
  if (DEBUG) {
    if (console && typeof console.log !== 'undefined') {
      console.log(m);
    }
  }
}

$(document).ready(function() {
  get_options(init);
});

function init() {
  document.body.style.display = '';

  $(':radio').each(function() {
    var key = this.name.replace('radio-', '');
    debug(key + ',' + typeof this.value + ', ' + this.value + ',' + typeof g_options[key] + ', ' + g_options[key]);
    if (this.value == g_options[key] || this.value == '' + g_options[key]) {
      this.checked = true;
    }
  });


  var timeformat = g_options['timeformat'];
  if (timeformat) {
    $('#time-format-input').val(timeformat);

    $('#time-format-select').val(timeformat);
  }

  $('button').button();
  $('.radioset').buttonset();
  $('input:text, input:password')
    .button()
    .css({
            'font' : 'inherit',
           'color' : 'inherit',
      'text-align' : 'left',
         'outline' : 'none',
          'cursor' : 'text'
    });

  var idleTime = [
    { name:'永不', duration:0 },
    { name:'三十分鐘', duration:30 * 60 * 1000 },
    { name:'一小時', duration:1 * 60 * 60 * 1000 },
    { name:'兩小時', duration:2 * 60 * 60 * 1000 },
    { name:'四小時', duration:4 * 60 * 60 * 1000 },
    { name:'八小時', duration:8 * 60 * 60 * 1000 },
    { name:'十二小時', duration:12 * 60 * 60 * 1000 },
    { name:'一天', duration:1 * 24 * 60 * 60 * 1000 },
    { name:'兩天', duration:2 * 24 * 60 * 60 * 1000 },
    { name:'三天', duration:3 * 24 * 60 * 60 * 1000 },
    { name:'一星期', duration:7 * 24 * 60 * 60 * 1000 }
  ];
  // get the slider index from the duration
  var sliderValue = 3;
  for (var i=0; i<idleTime.length; i++) {
    if (idleTime[i].duration == g_options['idle']) {
      sliderValue = i;
      $('#idle-time').html(idleTime[i].name);
      break;
    }
  }
  $('#idle-time-slider').slider({
    value: sliderValue,
    min: 0,
    max: 10,
    step: 1,
    slide: function(event, ui ) {
      $('#idle-time').html(idleTime[ui.value].name);
      storage.set({ idle: idleTime[ui.value].duration });
    }
  });

  $('#time-format-select').change(function() {
    $('#time-format-input').val($(this).val());
    if ($(this).val()) {
      storage.set({ timeformat: $(this).val() });
    }
  });

  $('#time-format-input').change(function() {
    if ($(this).val()) {
      storage.set({ timeformat: $(this).val() });
    }
  });

  $('#time-format-input').bind('keypress', function() {
    if ($(this).val()) {
      storage.set({ timeformat: $(this).val() });
    }
  });

  $('input[name=radio-favicon]').click(function() {
    if ($('#radio-favicon-custom').attr('checked')) {
      $('#favicon-custom-container').slideDown();
    }
    else {
      $('#favicon-custom-container').slideUp();
    }
  });

  $(':radio').click(function() {
    var newOptions = {};
    newOptions[this.name.replace('radio-', '')] = $('input:radio[name=' + this.name + ']:checked').val();
    storage.set(newOptions);
  });

  $('#btn-show-options').click(function() {
    $('#raw-options').toggle('slideDown');
  });

  chrome.storage.onChanged.addListener(function(changes, namespace) {
    /*
    for (key in changes) {
      var storageChange = changes[key];
      console.log('Storage key "%s" in namespace "%s" changed. ' +
                  'Old value was "%s", new value is "%s".',
                  key,
                  namespace,
                  storageChange.oldValue,
                  storageChange.newValue);
    }
    */
    // handle change by content script
    get_options();
    for (var key in changes) {
      if (key == 'blur') {
        $('#radio-blur-' + changes[key].newValue).prop('checked', true).button("refresh");
      }
    }
  });
}

function get_options(callback) {
  chrome.extension.sendMessage({msgId: 'get_options'}, function(response) {
    g_options = response.options;
    $('#raw-options').html(JSON.stringify(g_options, null, 4));
    if (callback) {
      callback();
    }
  });
}
