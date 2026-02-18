document.addEventListener('DOMContentLoaded', function() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(s => s);
    
    const lang = segments[0] === 'ru' ? 'ru' : 'en';
    
    let currentPage = 'main';
    if (segments.length > 1) {
        const possiblePages = ['bio', 'git', 'music', 'news', 'blog', 'links'];
        for (const page of possiblePages) {
            if (segments.includes(page)) {
                currentPage = page;
                break;
            }
        }
    }
    
    let basePath = '';
    if (currentPage !== 'main') {
        basePath = '../';
    }
    
    const pages = [
        { id: 'main', name: 'main', path: 'index.html' },
        { id: 'bio', name: 'bio', path: 'bio/index.html' },
        { id: 'git', name: 'git', path: 'git/index.html' },
        { id: 'music', name: 'music', path: 'music/index.html' },
        { id: 'news', name: 'news', path: 'news/index.html' },
        { id: 'blog', name: 'blog', path: 'blog/index.html' },
        { id: 'links', name: 'links', path: 'links/index.html' }
    ];
    
    const getCssVariable = (name) => {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    };
    
    const accentColor = getCssVariable('--accent-color') || '#B554D4';
    const textColor = getCssVariable('--text-color') || '#ffffff';
    const secondaryColor = getCssVariable('--secondary-color') || '#471784';
    const bgColor = getCssVariable('--bg-color') || '#000000';
    
    let navHtml = '<ul>';
    pages.forEach(page => {
        if (page.id === currentPage) {
            navHtml += `<li><a style="background-color:${accentColor};color:${textColor};border-color:${accentColor};cursor:default;">${page.name}</a></li>`;
        } else {
            const href = basePath + page.path;
            navHtml += `<li><a href="${href}" style="background-color:${bgColor};color:${textColor};border-color:${secondaryColor};">${page.name}</a></li>`;
        }
    });
    navHtml += '</ul>';
    
    const navElement = document.querySelector('nav');
    if (navElement) {
        navElement.innerHTML = `<div class="main-nav">${navHtml}</div>`;
    }
});
