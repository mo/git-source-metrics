/* Example URL: http://a.com/hello.html?first=blah&second=yada&second=meh
 * Example URL params: get_url_params() == ["first" : "blah", "second" : ["yada", "meh"]]
 */
function get_url_params()
{
	params = []
	keyvals = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&')
	for(var i = 0; i < keyvals.length; ++i)
	{
		keyval = keyvals[i].split('=')
		if (params[keyval[0]] == undefined)
			params[keyval[0]] = keyval[1] 
		else if (!params[keyval[0]].push) 
			params[keyval[0]] = [params[keyval[0]], keyval[1]]
		else
			params[keyval[0]].push(keyval[1])
	}
	return params
}

function bytesToSize(bytes) {
	var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	if (bytes == 0) return 'n/a';
	var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
	return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};
