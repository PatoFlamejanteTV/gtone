// Small settings handler for the local profile and optional servers.
$(function() {
  function load() {
    chrome.storage.local.get(['name', 'picture', 'signalingUrl', 'logServerUrl'], function(result) {
      $('#profile_name').val(result.name || '');
      $('#profile_picture').val(result.picture || '');
      $('#signaling_url').val(result.signalingUrl || '');
      $('#log_server_url').val(result.logServerUrl || '');
    });
  }

  $('#save_profile').on('click', function() {
    var name = $('#profile_name').val();
    var picture = $('#profile_picture').val();
    if (!name) {
      alert('Please enter a display name');
      return;
    }
    chrome.storage.local.set({name: name, picture: picture}, function() {
      alert('Profile saved');
    });
  });

  $('#save_servers').on('click', function() {
    var signaling = $('#signaling_url').val();
    var logUrl = $('#log_server_url').val();
    chrome.storage.local.set({signalingUrl: signaling, logServerUrl: logUrl}, function() {
      alert('Server settings saved');
    });
  });

  load();
});
