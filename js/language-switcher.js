document.addEventListener('DOMContentLoaded', function() {
    const langToggle = document.getElementById('lang-toggle');
    const currentLang = window.location.pathname.includes('/ru/') ? 'ru' : 'en';
    
    langToggle.textContent = currentLang === 'ru' ? 'EN' : 'RU';
    
    langToggle.addEventListener('click', function() {
        const currentPath = window.location.pathname;
        const newLang = currentLang === 'ru' ? 'en' : 'ru';
        
        let newPath;
        if (currentLang === 'ru') {
            newPath = currentPath.replace('/ru/', '/en/');
        } else if (currentLang === 'en') {
            newPath = currentPath.replace('/en/', '/ru/');
        } else {
            newPath = `/${newLang}${currentPath}`;
        }
        
        window.location.href = newPath;
    });
});
