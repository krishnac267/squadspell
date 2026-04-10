'use strict';

document.getElementById('open-game').addEventListener('click', () => {
  const url = chrome.runtime.getURL('game.html');
  chrome.windows.create({
    url,
    type: 'popup',
    width: 1200,
    height: 880,
    focused: true
  });
  window.close();
});
