// Get the button element
const button = document.getElementById('modify-button');

// Listen for the click event on the button
button.addEventListener('click', () => {
    // Disable the button
    button.disabled = true;

    // Send a message to the active tab to run the modification script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {message: 'modify_article'});
    });
});
