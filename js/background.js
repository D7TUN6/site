document.addEventListener('DOMContentLoaded', function() {
    function setBackground() {
        let mediaPath = '../media/background/';
        
        const currentPath = window.location.pathname;
        const segments = currentPath.split('/').filter(s => s);
        
        if (segments.length >= 2 && (segments[0] === 'en' || segments[0] === 'ru')) {
            if (segments.length === 2) {
                mediaPath = '../media/background/';
            } else {
                mediaPath = '../../media/background/';
            }
        } else if (segments.length === 0 || (segments.length === 1 && segments[0] === 'index.html')) {
            mediaPath = './media/background/';
        }
        
        const backgroundImage = `url('${mediaPath}current-release.jpg')`;
        
        document.body.style.setProperty('--background-image', backgroundImage);
        
        console.log('Background set to:', backgroundImage);
    }
    
    setBackground();
});
