
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // message.message gets the string from popup.js
    if (message.message === 'modify_article') {
    
    
    
    // Get all img elements on the page
    const images = document.querySelectorAll('img');
    
    // Loop through each image element and set its loading attribute to "eager"
    images.forEach(image => {
        image.setAttribute('loading', 'eager');
    });
    
    
    
    // Get all the article media elements
    const articleMediaElements = document.querySelectorAll('.dhks-background img, .dhks-background > video:first-of-type');


    
    
    // Get all the article text elements, including the title
    const articleTextElements = document.querySelectorAll('.dhks-card .dhks-text, .dhks-content, .dhks-title, .dhks-lead, .dhks-author__name, dhks-author__role, dhks-publish__date');
    
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
        currentIndex++;
        console.log('Current Index:', currentIndex); // Debugging output
    }

    // Get the corresponding media element and extract the src attribute
    const mediaElement = articleMediaElements[currentIndex];

    if (!mediaElement) {
        console.warn(`No media element found for index ${currentIndex}`);
        return;
    }

    const mediaSrc = mediaElement.tagName.toLowerCase() === 'img' ? mediaElement.currentSrc : mediaElement.querySelector('source[type="video/mp4"]').src;

    
    console.log('Media Source:', mediaSrc); // Debugging output

    
    // Get the text content and store it in the articleData array
    const textContent = textElement.textContent.trim();

    // If the current index in the articleData array does not exist yet,
    // create it and push the object with mediaSrc and textContent to it.
    const mediaType = mediaElement.tagName.toLowerCase() === 'img' ? 'image' : mediaElement.tagName.toLowerCase() === 'video' ? 'video' : null;


    if (!articleData[currentIndex]) {
        articleData[currentIndex] = {
            mediaType,
            mediaSrc,
            textContent: [textContent || ''] // Add an empty string if textContent is falsy
        };
    } else {
        articleData[currentIndex].textContent.push(textContent || ''); // Add an empty string if textContent is falsy
    }
    
    // If the current index has no text but the previous index does, add the current image to the previous index
    if (!textContent && articleData[prevIndex] && articleData[prevIndex].mediaSrc === mediaSrc) {
        articleData[prevIndex].textContent.push('');
    }

    

});


// Create a new div element to hold the article
const articleDiv = document.createElement('div');
articleDiv.style.margin = '0 auto';
articleDiv.style.maxWidth = '800px';
articleDiv.style.padding = '30px';
articleDiv.style.fontFamily = 'Arial, sans-serif';

const topDiv = document.createElement('div');
topDiv.style.display = 'flex';
topDiv.style.justifyContent = 'space-between';
topDiv.style.alignItems = 'center';
topDiv.style.color = '#A9A9A9';

topDiv.style.borderBottom = '1px solid #ccc';
topDiv.style.paddingBottom = '30px';

const profileDiv = document.createElement('div');
profileDiv.style.display = 'flex';

profileDiv.style.justifyContent = 'space-between';
profileDiv.style.float = 'left';


const profileImage = document.createElement('img');
profileImage.src = 'https://thumbs2.imgbox.com/c3/65/2ewp5PM2_t.png';
profileImage.style.width = '100px';
profileImage.style.height = '100px';
profileImage.style.borderRadius = '50%';
profileImage.style.marginLeft = '10px';
profileImage.style.marginTop = '10px';


profileDiv.appendChild(profileImage);
topDiv.appendChild(profileDiv);

console.log(articleData);

// Iterate through the article data and create HTML elements for each item
articleData.forEach((item) => {
    // Create a new div element to hold the image and text
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.flexDirection = 'column';
    itemDiv.style.alignItems = 'center';
    itemDiv.style.marginBottom = '30px';
    
    // Creates the media element
    let mediaElement;
    if (item.mediaType === 'image') {
        mediaElement = document.createElement('img');
        mediaElement.src = item.mediaSrc;
        mediaElement.style.width = '100%';
        mediaElement.style.maxWidth = '800px';
        mediaElement.style.height = 'auto';
        mediaElement.style.marginBottom = '20px';
    } else if (item.mediaType === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.src = item.mediaSrc;
        mediaElement.style.width = '100%';
        mediaElement.style.maxWidth = '800px';
        mediaElement.style.height = 'auto';
        mediaElement.style.marginBottom = '20px';
        mediaElement.controls = true;
    }
    // Create a new div element to hold the text
    const textDiv = document.createElement('div');
    textDiv.style.textAlign = 'center';

    // Iterate through the text content for this item and create paragraphs for each
    item.textContent.forEach((text) => {
        const pElement = document.createElement('p');
        pElement.textContent = text;
        console.log('itemDiv:', itemDiv);
        console.log('mediaElement:', mediaElement);
        console.log('textDiv:', textDiv);   
        textDiv.appendChild(pElement);
    });
    
    // Add the media element and text to the item div, and add the item div to the article div
    
    itemDiv.appendChild(mediaElement);
    
    itemDiv.appendChild(textDiv);
    articleDiv.appendChild(itemDiv);
});




// Replace the page content with the article div
const body = document.querySelector('body');
body.innerHTML = '';
body.appendChild(topDiv);
body.appendChild(articleDiv);
    }
});

