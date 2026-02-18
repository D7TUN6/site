document.addEventListener('DOMContentLoaded', function() {
    // Используем абсолютные пути от корня сайта
    const baseUrl = window.location.origin;
    const isLocalFile = window.location.protocol === 'file:';
    
    // Функция для получения правильного пути
    const getTemplatePath = (templateName) => {
        if (isLocalFile) {
            // Для локального запуска (file://)
            const pathSegments = window.location.pathname.split('/');
            
            // Определяем глубину
            let depth = 0;
            if (pathSegments.includes('en') || pathSegments.includes('ru')) {
                const langIndex = pathSegments.findIndex(s => s === 'en' || s === 'ru');
                depth = pathSegments.length - langIndex - 2; // -2 для lang/ и index.html
            }
            
            const basePath = depth > 0 ? '../'.repeat(depth) : './';
            return `${basePath}templates/${templateName}`;
        } else {
            // Для веб-сервера
            return `/templates/${templateName}`;
        }
    };
    
    // Загружаем шаблоны
    const templates = [
        { name: 'header.html', selector: 'header' },
        // { name: 'nav.html', selector: 'nav' }
    ];
    
    templates.forEach(({ name, selector }) => {
        fetch(getTemplatePath(name))
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load ${name}`);
                return response.text();
            })
            .then(html => {
                const element = document.querySelector(selector);
                if (element) element.innerHTML = html;
            })
            .catch(error => {
                console.error(`Error loading ${name}:`, error);
                // Fallback: если шаблон не загрузился, показываем сообщение
                const element = document.querySelector(selector);
                if (element && element.innerHTML.trim() === '') {
                    element.innerHTML = `<div style="color: #ff00ff; padding: 10px; border: 1px solid #ff00ff;">
                        [${selector} template failed to load]
                    </div>`;
                }
            });
    });
});
