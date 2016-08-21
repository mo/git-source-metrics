/* Example URL: http://a.com/hello.html?first=blah&second=yada&second=meh
 * Example URL params: getUrlParams() == {"first" : "blah", "second" : ["yada", "meh"]}
 */
function getUrlParams()
{
    const questionMarkIdx = window.location.href.indexOf('?');
    if (questionMarkIdx == -1) {
        return {};
    }
    const params = {};
    const keyvals = window.location.href.slice(questionMarkIdx + 1).split('&');
    for(var i = 0; i < keyvals.length; ++i)
    {
        const keyval = keyvals[i].split('=');
        if (params[keyval[0]] == undefined)
            params[keyval[0]] = keyval[1];
        else if (!params[keyval[0]].push)
            params[keyval[0]] = [params[keyval[0]], keyval[1]];
        else
            params[keyval[0]].push(keyval[1]);
    }
    return params;
}

function buildUrlStringFromUrlParams(params) {
    const new_url = Object.keys(params).sort().map((key) => {
        const val = params[key];
        if (val.push) {
            return val.map((v) => key + '=' + v);
        }
        return key + '=' + val;
    }).reduce((acc, item) => {
        return acc.concat(item);
    }, []).join('&');
    return '?' + new_url;
}

function reloadWithNewUrlParams(params) {
    window.location = buildUrlStringFromUrlParams(params);
}

function bytesToSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes == 0) return 'n/a';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}
