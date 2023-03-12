// TODO: bare aktiveres når man trykker på extension ikonet
// gjør den bare gyldig på nrk sider


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(message);
    // message.message gets the string from popup.js
    if (message.message === 'modify_article') {
    console.log('modify-button');
    // Do something with the message data here
    
    // Get all img elements on the page
    const images = document.querySelectorAll('img');
    
    // Loop through each image element and set its loading attribute to "eager"
    images.forEach(image => {
        image.setAttribute('loading', 'eager');
    });
    
    
    
    // Get all the article image elements
    const articleImageElements = document.querySelectorAll('.dhks-background img');
    imageList = []
    
    
    
    // Get all the article text elements, including the title
    const articleTextElements = document.querySelectorAll('.dhks-card .dhks-text, .dhks-content, .dhks-title');
    
    // Create an empty array to store the image, title, and text objects
    const articleData = [];
    
    // Initialize the current index to -1
let currentIndex = -1;

// Iterate through the text elements and extract the text content and data-card-index
articleTextElements.forEach((textElement, index) => {
    // Get the data-card-index of the text element
    const dataCardIndex = textElement.parentElement.getAttribute('data-card-index');
    
    // Check if the data-card-index has reset to 0
    if (dataCardIndex === '0') {
        // Increment the current index to move to the next image
        currentIndex++;
    }
    
    // Get the corresponding image element and extract the src attribute
    const imageSrc = articleImageElements[currentIndex].currentSrc;
    
    // Get the text content and store it in the articleData array
    const textContent = textElement.textContent.trim();
    
    // If the current index in the articleData array does not exist yet,
    // create it and push the object with imageSrc and textContent to it.
    if (!articleData[currentIndex]) {
        articleData[currentIndex] = {
            imageSrc,
            textContent: [textContent]
        };
    } else {
        // If the current index already exists, push the textContent to its existing array
        articleData[currentIndex].textContent.push(textContent);
    }
});



// Create a new div element to hold the article
const articleDiv = document.createElement('div');
articleDiv.style.margin = '0 auto';
articleDiv.style.maxWidth = '800px';
articleDiv.style.padding = '30px';
articleDiv.style.fontFamily = 'Arial, sans-serif';

// Iterate through the article data and create HTML elements for each item
articleData.forEach((item) => {
    // Create a new div element to hold the image and text
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.flexDirection = 'column';
    itemDiv.style.alignItems = 'center';
    itemDiv.style.marginBottom = '30px';
    
    // Create a new image element and set its source
    const imgElement = document.createElement('img');
    imgElement.src = item.imageSrc;
    imgElement.style.maxWidth = '100%';
    imgElement.style.height = 'auto';
    imgElement.style.marginBottom = '10px';
    
    // Create a new div element to hold the text
    const textDiv = document.createElement('div');
    textDiv.style.textAlign = 'center';

    // Iterate through the text content for this item and create paragraphs for each
    item.textContent.forEach((text) => {
        const pElement = document.createElement('p');
        pElement.textContent = text;
        textDiv.appendChild(pElement);
    });
    
    // Add the image and text to the item div, and add the item div to the article div
    itemDiv.appendChild(imgElement);
    itemDiv.appendChild(textDiv);
    articleDiv.appendChild(itemDiv);
});

// Replace the page content with the article div
const body = document.querySelector('body');
body.innerHTML = '';
body.appendChild(articleDiv);
    }
});

