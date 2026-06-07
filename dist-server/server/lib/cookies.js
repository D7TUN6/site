export function getCookie(req, name) {
    const cookies = req.cookies;
    if (!cookies)
        return null;
    const value = cookies[name];
    return typeof value === 'string' && value.length > 0 ? value : null;
}
