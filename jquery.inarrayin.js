// http://stackoverflow.com/questions/3390930/any-way-to-make-jquery-inarray-case-insensitive
(function($){
    $.extend({
        // Case insensative inArray
        inArrayIn: function(elem, arr, i){
            // not looking for a string anyways, use default method
            if (typeof elem !== 'string'){
                return $.inArray.apply(this, arguments);
            }
            // confirm array is populated
            if (arr){
                var len = arr.length;
                i = i ? (i < 0 ? Math.max(0, len + i) : i) : 0;
                elem = elem.toLowerCase();
                for (; i < len; i++){
                    if (i in arr && arr[i].toLowerCase() == elem){
                        return i;
                    }
                }
            }
            // stick with inArray/indexOf and return -1 on no match
            return -1;
        }
    });
})(jQuery);
