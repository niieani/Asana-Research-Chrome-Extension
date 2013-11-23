console.log(chrome.windows)

//chrome.windows.create({height: 10, top: 10000, width:1}, function(hiddenWindow) {
//  console.log(hiddenWindow)

function navigateExistingAsana(fragment, tabToAvoid, callback) {
  chrome.tabs.query({
    url: "https://*.asana.com/*",
    currentWindow: true
  }, function(asanaTabs) {

    // Filter out the tab that just opened, we don't want to reuse that!
    asanaTabs = asanaTabs.filter(function (eachAsanaTab) {
      return eachAsanaTab.id !== tabToAvoid
    })

    if (asanaTabs.length > 0) {
      var chosenAsanaTab = asanaTabs[0]
      chrome.tabs.highlight({tabs:chosenAsanaTab.index}, function() {
        console.log("highlighted the tab")
      })
      chrome.tabs.executeScript(chosenAsanaTab.id, {
        code: "window.postMessage('fragment|" + fragment + "', '*')"

        // Monkey patch for an asana tab to make this work:
        // window.addEventListener("message", function(message) {srun(function() {env.datastore_manager.enactChange(FragmentChange.create({fragment: message.data}))})})
      })
      callback(true)
    }

    callback(false)
  })
}

var urlFilter = {hostEquals: "app.asana.com"}
//chrome.webNavigation.onBeforeNavigate.url(urlFilter)
  chrome.webNavigation.onBeforeNavigate.addListener(function (event) {
    console.log(event)

    // Check the url being navigated to follows the exact pattern we expect
    if (event.url.lastIndexOf("https://app.asana.com") !== 0) return
    var fragment = event.url.substr("https://app.asana.com".length)
    console.log("fragment was", fragment)

    chrome.tabs.get(event.tabId, function(tab) {
      if (!tab.highlighted) {
        navigateExistingAsana(fragment, event.tabId, function(succeeded) {
          if (succeeded) {
            chrome.tabs.remove(tab.id)
          }
        })
      }
    })

//    chrome.tabs.reload(event.tabId)

//    chrome.tabs.move(event.tabId, {windowId: hiddenWindow.id, index:-1})


//  chrome.tabs.create({
//    active: true
//  }, function (tab) {
//    console.log("created tab", tab)
//  })
  }, {url: [urlFilter]})
//})