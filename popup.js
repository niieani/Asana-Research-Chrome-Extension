/**
 * Code for the popup UI.
 */
Popup = {

  // Is this an external popup window? (vs. the one from the menu)
  is_external: false,

  // Options loaded when popup opened.
  options: null,

  // Info from page we were triggered from
  page_title: null,
  page_url: null,
  page_selection: null,
  favicon_url: null,
  active_window_titles: null,
  active_window_urls: null,
  all_tabs: null,
  this_tab: null,

  // State to track so we only log events once.
  has_edited_name: false,
  has_edited_notes: false,
  has_reassigned: false,
  has_used_page_details: false,
  is_first_add: true,

  // Data from API cached for this popup.
  workspaces: null,
  users: null,
  user_id: null,
  projects: null,
  tags: null,
  
  // Typeahead ui element
  typeahead: null,

  // Cached attachments
  attachments: new Array(),

  onLoad: function() {
    var me = this;

    me.is_external = ('' + window.location.search).indexOf("external=true") !== -1;

    // Our default error handler.
    Asana.ServerModel.onError = function(response) {
      me.showError(response.errors[0].message);
    };

    // Ah, the joys of asynchronous programming.
    // To initialize, we've got to gather various bits of information.
    // Starting with a reference to the window and tab that were active when
    // the popup was opened ...
    chrome.tabs.query({
      currentWindow: true
    }, function(tabs) {
      var tab = null;
      var active_window_urls = new Array();
      var active_window_titles = new Array();
        tabs.forEach(function(single_tab){
            if(single_tab.active)
                tab = single_tab;
            active_window_urls.push(single_tab.url);
            active_window_titles.push(single_tab.title);
        });
        // TODO: fixme
        me.all_tabs = tabs;
        me.this_tab = tab;

      // Now load our options ...
      Asana.ServerModel.options(function(options) {
        me.options = options;

        // And ensure the user is logged in ...
        Asana.ServerModel.isLoggedIn(function(is_logged_in) {
          if (is_logged_in) {
            if (window.quick_add_request) {
              Asana.ServerModel.logEvent({
                name: "ChromeExtension-Open-QuickAdd"
              });
              // If this was a QuickAdd request (set by the code popping up
              // the window in Asana.ExtensionServer), then we have all the
              // info we need and should show the add UI right away.
              me.showAddUi(
                  quick_add_request.url, quick_add_request.title,
                  quick_add_request.selected_text,
                  quick_add_request.favicon_url,
                  quick_add_request.active_window_titles,
                  quick_add_request.active_window_urls
              );
            } else {
              Asana.ServerModel.logEvent({
                name: "ChromeExtension-Open-Button"
              });
              // Otherwise we want to get the selection from the tab that
              // was active when we were opened. So we set up a listener
              // to listen for the selection send event from the content
              // window ...
              var selection = "";
              var listener = function(request, sender, sendResponse) {
                if (request.type === "selection") {
                  chrome.runtime.onMessage.removeListener(listener);
                  console.info("Asana popup got selection");
                  selection = "\n" + request.value;
                }
              };
              chrome.runtime.onMessage.addListener(listener);
              me.showAddUi(tab.url, tab.title, '', tab.favIconUrl,
                  active_window_titles,
                  active_window_urls);
            }
          } else {
            // The user is not even logged in. Prompt them to do so!
            me.showLogin(
                Asana.Options.loginUrl(options),
                Asana.Options.signupUrl(options));
          }
        });
      });
    });

    // Wire up some events to DOM elements on the page.

    $(window).keydown(function(e) {
      // Close the popup if the ESCAPE key is pressed.
      if (e.which === 27) {
        if (me.is_first_add) {
          Asana.ServerModel.logEvent({
            name: "ChromeExtension-Abort"
          });
        }
        window.close();
      } else if (e.which === 9) {
        // Don't let ourselves TAB to focus the document body, so if we're
        // at the beginning or end of the tab ring, explicitly focus the
        // other end (setting body.tabindex = -1 does not prevent this)
        if (e.shiftKey && document.activeElement === me.firstInput().get(0)) {
          me.lastInput().focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === me.lastInput().get(0)) {
          me.firstInput().focus();
          e.preventDefault();
        }
      }
    });

    // Close if the X is clicked.
    $(".close-x").click(function() {
      if (me.is_first_add) {
        Asana.ServerModel.logEvent({
          name: "ChromeExtension-Abort"
        });
      }
      window.close();
    });

    $("#name_input").keyup(function() {
      if (!me.has_edited_name && $("#name_input").val() !== "") {
        me.has_edited_name = true;
        Asana.ServerModel.logEvent({
          name: "ChromeExtension-ChangedTaskName"
        });
      }
//      me.maybeDisablePageDetailsButton();
    });
    $("#notes_input").keyup(function() {
      if (!me.has_edited_notes && $("#notes_input").val() !== "") {
        me.has_edited_notes = true;
        Asana.ServerModel.logEvent({
          name: "ChromeExtension-ChangedTaskNotes"
        });
      }
//      me.maybeDisablePageDetailsButton();

        // TODO: add automatic save
    });


      addAttachment = function(){
          console.log({ tabId: me.this_tab.id });
          chrome.pageCapture.saveAsMHTML({ tabId: me.this_tab.id }, function(attachment){
              console.log("attaching");
//                  me.attachments.push(attachment.slice(undefined, attachment.size, 'application/x-mimearchive'));
              me.attachments.push(attachment);
          });
//              Disable the buttons once used.
//          add_attachment_button.addClass('disabled');
//          add_attachments_button.addClass('disabled');
      };

      addAttachments = function(){
          me.all_tabs.forEach(function(tab){
              chrome.pageCapture.saveAsMHTML({ tabId: tab.id }, function(attachment){
                  console.log("attaching");
//                      me.attachments.push(attachment.slice(undefined, attachment.size, 'message/rfc822'));
                  me.attachments.push(attachment.slice(undefined, attachment.size, 'application/x-mimearchive'));
              });
          });
          // Disable the buttons once used.
//          add_attachment_button.addClass('disabled');
//          add_attachments_button.addClass('disabled');
      }

    // The page details button fills in fields with details from the page
    // in the current tab (cached when the popup opened).
      var use_page_details_button = $("#use_page_details");
      var use_window_details_button = $("#use_window_details");
      use_page_details_button.click(function() {
          if (!(use_page_details_button.hasClass('disabled'))) {
              // Page title -> task name
              $("#name_input").val(me.page_title);
              // Page url + selection -> task notes
              var notes = $("#notes_input");
              notes.val(notes.val() + me.page_url + "\n" + me.page_selection);
              // Disable the page & window details button once used.
              use_page_details_button.addClass('disabled');
              use_window_details_button.addClass('disabled');
              if (!me.has_used_page_details) {
                  me.has_used_page_details = true;
                  Asana.ServerModel.logEvent({
                      name: "ChromeExtension-UsedPageDetails"
                  });
              }
              addAttachment();
          }
      });

      use_window_details_button.click(function() {
          if (!(use_window_details_button.hasClass('disabled'))) {
              // window title -> task name
              $("#name_input").val(me.page_title);
              // Page url + selection -> task notes
              var notes = $("#notes_input");
              var notes_output = notes.val();
              me.active_window_titles.forEach(function(title, index){
                  notes_output = notes_output + title + "\n" + me.active_window_urls[index] + "\n\n";
              });
              notes.val(notes_output + me.page_selection);
              // Disable the page & window details button once used.
              use_page_details_button.addClass('disabled');
              use_window_details_button.addClass('disabled');
              if (!me.has_used_window_details) {
                  me.has_used_window_details = true;
                  Asana.ServerModel.logEvent({
                      name: "ChromeExtension-UsedWindowDetails"
                  });
              }
              addAttachments();
          }
      });
/*
      var add_attachment_button = $("#add_attachment_button");
      var add_attachments_button = $("#add_attachments_button");

      add_attachment_button.click(function() {
          if (!(add_attachment_button.hasClass('disabled'))) {
          }
      });

      add_attachments_button.click(function() {
          if (!(add_attachments_button.hasClass('disabled'))) {
          }
      });
*/
      var save_tags_button = $("#save_tags");
      save_tags_button.click(function() {
          // Save selection as new default.
          me.options.default_tags = $("#tags_input").tagit("assignedTags");
//          console.log(me.options.default_tags);
          Asana.ServerModel.saveOptions(me.options, function() {});
      });

      var save_projects_button = $("#save_projects");
      save_projects_button.click(function() {
          // Save selection as new default.
          me.options.default_projects = $("#projects_input").tagit("assignedTags");
          Asana.ServerModel.saveOptions(me.options, function() {});
      });

      var save_assignee_button = $("#save_assignee");
      save_assignee_button.click(function() {
          var assignee_id = me.typeahead.selected_user_id;
          // Save selection as new default.
          me.options.default_assignee_id = assignee_id;
          Asana.ServerModel.saveOptions(me.options, function() {});
      });

    // Make a typeahead for assignee
    me.typeahead = new UserTypeahead("assignee");
  },

  maybeDisablePageDetailsButton: function() {
    if ($("#name_input").val() !== "" || $("#notes_input").val() !== "") {
      $("#use_page_details").addClass('disabled');
    } else {
      $("#use_page_details").removeClass('disabled');
    }
  },

  setExpandedUi: function(is_expanded) {
//    if (this.is_external) {
      window.resizeTo(
          Asana.POPUP_UI_WIDTH,
          (is_expanded ? Asana.POPUP_EXPANDED_UI_HEIGHT : Asana.POPUP_UI_HEIGHT)
              + Asana.CHROME_TITLEBAR_HEIGHT);
//    }
  },

  showView: function(name) {
    ["login", "add"].forEach(function(view_name) {
      $("#" + view_name + "_view").css("display", view_name === name ? "" : "none");
    });
  },

  showAddUi: function(url, title, selected_text, favicon_url, active_window_titles, active_window_urls) {
    var me = this;

    // Store off info from page we got triggered from.
    me.page_url = url;
    me.page_title = title;
    me.page_selection = selected_text;
    me.favicon_url = favicon_url;
    me.active_window_titles = active_window_titles;
    me.active_window_urls = active_window_urls;

    // Populate workspace selector and select default.
    Asana.ServerModel.me(function(user) {
      me.user_id = user.id;
      Asana.ServerModel.workspaces(function(workspaces) {
        me.workspaces = workspaces;
        var select = $("#workspace_select");
        select.html("");
        workspaces.forEach(function(workspace) {
          $("#workspace_select").append(
              "<option value='" + workspace.id + "'>" + workspace.name + "</option>");
        });
        if (workspaces.length > 1) {
          $("workspace_select_container").show();
        } else {
          $("workspace_select_container").hide();
        }
        select.val(me.options.default_workspace_id);
        me.onWorkspaceChanged();
        select.change(function() {
          if (select.val() !== me.options.default_workspace_id) {
            Asana.ServerModel.logEvent({
              name: "ChromeExtension-ChangedWorkspace"
            });
          }
          me.onWorkspaceChanged();
        });

        // Set initial UI state

          getCurrentTags = function(){
              return me.tags_in_asana;
          }
          getCurrentProjects = function(){
              return me.projects_in_asana;
          }

          $('#tags_input').tagit({
              removeConfirmation: true,
              allowSpaces: true,
              autoFocus: true,
              autocomplete: {
//                  autoFocus: true,
                  source: function(request, response){
                      response( $.ui.autocomplete.filter(
                          getCurrentTags(), request.term ) );
                  }
              },
              caseSensitive: false,
              placeholderText: "Tags",
              preprocessTag: function(val) {
                  if (!val) { return ''; }
                  // find the correct case
                  var index = $.inArrayIn(val, me.tags_in_asana);
                  if (index > -1)
                  {
                      console.log(me.tags_in_asana[index]);
                      return me.tags_in_asana[index];
                  }
                  else
                      return val;
              }
          });

          $('#projects_input').tagit({
              removeConfirmation: true,
              allowSpaces: true,
              autoFocus: true,
              autocomplete: {
//                  autoFocus: true,
                  source: function(request, response){
                      response( $.ui.autocomplete.filter(
                          getCurrentProjects(), request.term ) );
                  }
              },
              caseSensitive: false,
              placeholderText: "Projects",
              preprocessTag: function(val) {
                  if (!val) { return ''; }
                  // find the correct case
                  var index = $.inArrayIn(val, me.projects_in_asana);
                  if (index > -1)
                  {
                      console.log(me.projects_in_asana[index]);
                      return me.projects_in_asana[index];
                  }
                  else
                      return val;
              }
          });

        me.resetFields();
        me.showView("add");
        var name_input = $("#name_input");
        name_input.focus();
        name_input.select();

        if (favicon_url) {
          $(".icon-use-link").css("background-image", "url(" + favicon_url + ")");
        } else {
          $(".icon-use-link").addClass("no-favicon sprite");
        }
      });
    });
  },

  /**
   * @param enabled {Boolean} True iff the add button should be clickable.
   */
  setAddEnabled: function(enabled) {
    var me = this;
    var button = $("#add_button");
    if (enabled) {
      // Update appearance and add handlers.
      button.removeClass("disabled");
      button.addClass("enabled");
      button.click(function() {
        me.createTask();
        return false;
      });
      button.keydown(function(e) {
        if (e.keyCode === 13) {
          me.createTask();
        }
      });
    } else {
      // Update appearance and remove handlers.
      button.removeClass("enabled");
      button.addClass("disabled");
      button.unbind('click');
      button.unbind('keydown');
    }
  },

  showError: function(message) {
    console.log("Error: " + message);
    $("#error").css("display", "inline-block");
  },

  hideError: function() {
    $("#error").css("display", "none");
  },

  /**
   * Clear inputs for new task entry.
   */
  resetFields: function() {
    $("#name_input").val("");
    $("#notes_input").val("");
    this.typeahead.setSelectedUserId(this.options.default_assignee_id);

//    $("#projects_input").tagit();

    $("#projects_input").tagit("removeAll");
    if(typeof this.options.default_projects !== 'undefined')
        this.options.default_projects.forEach(function(project){
//            console.log(project);
            $("#projects_input").tagit("createTag", project);
        });

//    $("#tags_input").tagit();

    $("#tags_input").tagit("removeAll");
    if(typeof this.options.default_tags !== 'undefined')
        this.options.default_tags.forEach(function(tag){
//            console.log(tag);
            $("#tags_input").tagit("createTag", tag);
        });


    $("use_page_details_button").removeClass('disabled');
    $("use_window_details_button").removeClass('disabled');

      // TODO
    this.attachments = new Array();
  },

  /**
   * Set the add button as being "working", waiting for the Asana request
   * to complete.
   */
  setAddWorking: function(working) {
    this.setAddEnabled(!working);
    $("#add_button").find(".button-text").text(
        working ? "Adding..." : "Add to Asana");
  },

  /**
   * Update the list of users as a result of setting/changing the workspace.
   */
  onWorkspaceChanged: function() {
    var me = this;
    var workspace_id = me.selectedWorkspaceId();

    // Update selected workspace
    $("#workspace").html($("#workspace_select option:selected").text());

    // Save selection as new default.
    me.options.default_workspace_id = workspace_id;
    Asana.ServerModel.saveOptions(me.options, function() {});

    // Update assignee list.
    me.setAddEnabled(false);
    Asana.ServerModel.users(workspace_id, function(users) {
      me.typeahead.updateUsers(users);
      me.setAddEnabled(true);
    });

    // Update tags.
      Asana.ServerModel.tags(workspace_id, function(tags) {
          me.tags = tags;

          me.tags_in_asana = new Array();
          tags.forEach(function(tag) {
              me.tags_in_asana.push(tag.name)
          });
      });

      // Update projects.
      Asana.ServerModel.projects(workspace_id, function(projects) {
          me.projects = projects;

          me.projects_in_asana = new Array();
          projects.forEach(function(project) {
              me.projects_in_asana.push(project.name)
          });
      });
  },

  /**
   * @param id {Integer}
   * @return {dict} Workspace data for the given workspace.
   */
  workspaceById: function(id) {
    var found = null;
    this.workspaces.forEach(function(w) {
      if (w.id === id) {
        found = w;
      }
    });
    return found;
  },

  /**
   * @return {Integer} ID of the selected workspace.
   */
  selectedWorkspaceId: function() {
    return parseInt($("#workspace_select").val(), 10);
  },

  /**
   * Create a task in asana using the data in the form.
   */
  createTask: function() {
    var me = this;

    // Update UI to reflect attempt to create task.
    console.info("Creating task");
    me.hideError();
    me.setAddWorking(true);

    if (!me.is_first_add) {
      Asana.ServerModel.logEvent({
        name: "ChromeExtension-CreateTask-MultipleTasks"
      });
    }

      // Prepare tags:
      var tags_to_add_all = $("#tags_input").tagit("assignedTags");

      var tags_to_create = $(tags_to_add_all).not(me.tags_in_asana).get();
      console.log(tags_to_create);

      var tag_ids_to_add = new Array();

      me.tags.forEach(function(tag) {
          if(tags_to_add_all.indexOf(tag.name) > -1)
          {
              tag_ids_to_add.push(tag.id);
          }
      });

      // Prepare projects:
      var projects_to_add_all = $("#projects_input").tagit("assignedTags");

      //      console.log("all pr to add:");
      //      console.log(projects_to_add_all);
      //      console.log("all pr");
      //      console.log(me.projects_in_asana);
      var projects_to_create = $(projects_to_add_all).not(me.projects_in_asana).get();
      //      console.log(projects_to_create);

      var project_ids_to_add = new Array();

      me.projects.forEach(function(project) {
          if(projects_to_add_all.indexOf(project.name) > -1)
          {
              project_ids_to_add.push(project.id);
          }
      });

      var refreshCache = function()
      {
          // TODO (doesn't work):
          console.log("Cleaning cache");
          chrome.runtime.sendMessage({
              type: "cache-refresh"}, function(){} );
      }

      var prepTags = function() {
          return $.Deferred(function(dfd){
              tags_to_create.forEach(function(tag_name) {
                  Asana.ServerModel.createTag(
                      me.selectedWorkspaceId(),
                      {
                          name: tag_name
                      },
                      function(tag) {
                          //Success!
                          tag_ids_to_add.push(tag.id);
                          me.tags_in_asana.push(tag.name);
                          me.tags.push(tag); // TODO: not needed ?
                          console.log(me.tags_in_asana);
                          if (tags_to_create.indexOf(tag) == tags_to_create.length-1)
                          {
                              console.log("opica: ", projects_to_create);
                              if (projects_to_create.length < 1)
                              {
                                  refreshCache();
                              }
                              dfd.resolve;
                          }
                      },

                      function(response) {
                          // Failure
                          // TODO
                          console.log("failed to create tag: " + tag_name);
                          console.log(response);
                          me.showError(response.errors[0].message);
                      }
                  );
              });
          }).promise();
      }

          var prepProjects = function(){
                return $.Deferred(function(dfd){
                    projects_to_create.forEach(function(project_name) {
                        Asana.ServerModel.createProject(
                            me.selectedWorkspaceId(),
                            {
                                name: project_name
                            },
                            function(project) {
                                //Success!
                                project_ids_to_add.push(project.id);
                                me.projects_in_asana.push(project.name);
                                me.projects.push(project); // TODO: not needed ?
                                console.log("successfully created project: " + project.name);
                                if (projects_to_create.indexOf(project) == projects_to_create.length-1)
                                {
                                    refreshCache();
                                    dfd.resolve;
                                }
                            },
                            function(response) {
                                // Failure
                                // TODO
                                console.log("failed to create project: " + project_name);
                                console.log(response);
                                me.showError(response.errors[0].message);
                            }
                        );
                    });
                }).promise();
          }


      var createTask = function(){
          console.log("will add tags:");
          console.log(tag_ids_to_add);

          console.log("will add projects:");
          console.log(project_ids_to_add);

          Asana.ServerModel.createTask(
              me.selectedWorkspaceId(),
              {
                  name: $("#name_input").val(),
                  notes: $("#notes_input").val(),
                  projects: project_ids_to_add,
                  assignee: me.typeahead.selected_user_id // || me.user_id // Default assignee to self
              },
              function(task) {
                  // Success! Show task success, then get ready for another input.
                  Asana.ServerModel.logEvent({
                      name: "ChromeExtension-CreateTask-Success"
                  });

                  // Add the tags:
                  tag_ids_to_add.forEach(function(tag_id) {
                      Asana.ServerModel.addTag(
                          task.id,
                          tag_id,
                          function(tag) {
                              //Success!
                              console.log("successfully tagged: " + tag_id);
                          },
                          function(response) {
                              // Failure
                              // TODO
                              console.log("failed to tag: " + tag_id);
                          }
                      );
                  });

                  // ZIP.JS model:

                  var zipModel = (function() {
                      var zipFileEntry, zipWriter, writer, creationMethod, URL = webkitURL || mozURL || URL;

                      return {
                          setCreationMethod: function(method) {
                              creationMethod = method;
                          },
                          addFiles: function addFiles(files, oninit, onadd, onprogress, onend) {
                              var addIndex = 0;

                              function nextFile() {
                                  var file = files[addIndex];
                                  onadd(file);
                                  var filename = "archive"+addIndex+".mhtml";
                                  zipWriter.add(filename, new zip.BlobReader(file), function() { //file.name
                                      addIndex++;
                                      if (addIndex < files.length)
                                          nextFile();
                                      else
                                          onend();
                                  }, onprogress);
                              }

                              function createZipWriter() {
                                  zip.createWriter(writer, function(writer) {
                                      zipWriter = writer;
                                      oninit();
                                      nextFile();
                                  }, onerror);
                              }

                              if (zipWriter)
                                  nextFile();
                              else if (creationMethod == "Blob") {
                                  writer = new zip.BlobWriter();
                                  createZipWriter();
                              }
                              /*
                               else {
                               createTempFile(function(fileEntry) {
                               zipFileEntry = fileEntry;
                               writer = new zip.FileWriter(zipFileEntry);
                               createZipWriter();
                               });
                               }
                               */
                          },
                          getBlobURL: function(callback) {
                              zipWriter.close(function(blob) {
                                  var blobURL = creationMethod == "Blob" ? URL.createObjectURL(blob) : zipFileEntry.toURL();
                                  //blobURL = window.createObjectURL(blob);
                                  callback(blobURL);
                                  zipWriter = null;
                              });
                          },
                          getBlob: function(callback) {
                              zipWriter.close(callback);
                          }
                      };
                  })();

                  // Add the attachments:
                  if(me.attachments !== null && me.attachments.length > 0)
                  {
                      console.log("Trying to zip...");
                      zipModel.setCreationMethod("Blob");
                      zipModel.addFiles(me.attachments, function() {}, function(file) {
                          console.log("Zipped file with " + file.size + " bytes" )
                      }, function() {}, function() {
                          zipModel.getBlobURL(function(attachment){
//                        console.log("Trying to attach: " + attachment.name + " <> " + attachment.type);
                              Asana.ServerModel.addAttachment(
                                  task.id,
                                  attachment,
                                  'archive '+(new Date()).toString().split(' ').splice(1,3).join(' ')+'.zip',
                                  'application/zip',
                                  function(reply) {
                                      //Success!
                                      console.log("Successfully attached (KBs): " + reply.size);
                                      console.log(reply);
                                      me.setAddWorking(false);
                                      me.showSuccess(task);
                                      me.resetFields();
                                      $("#name_input").focus();
                                  },
                                  function(response) {
                                      // Failure
                                      console.log("Failed to attach (KBs):  " + response.size);
                                      console.log(response);
                                      me.showError(response.errors[0].message);
                                  }
                              );
                          });
                      });


                      // old
                      /*
                       me.attachments.forEach(function(attachment) {
                       console.log("Trying to attach...");
                       Asana.ServerModel.addAttachment(
                       task.id,
                       //attachment,
                       URL.createObjectURL(attachment),
                       "archive.mhtml",
                       function(reply) {
                       //Success!
                       console.log("Successfully attached (KBs): " + attachment.size);
                       console.log(reply);
                       },
                       function(response) {
                       // Failure
                       console.log("Failed to attach (KBs):  " + attachment.size);
                       console.log(response);
                       }
                       );
                       });
                       */
                  }
                  else
                  {
                      console.log("Nothing to attach.");
                      me.setAddWorking(false);
                      me.showSuccess(task);
                      me.resetFields();
                      $("#name_input").focus();
                  }
                  /*
                   //zip.createWriter(new zip.BlobWriter("application/zip"), function(zipWriter) {
                   var no = 0;
                   me.attachments.forEach(function(attachment) {
                   no++;
                   console.log("Trying to zip...");
                   zipModel.addFiles()
                   // use a BlobReader object to read the data stored into blob variable
                   zipWriter.add("archive"+no+".mhtml", new zip.BlobReader(attachment), function() {
                   // close the writer and calls callback function
                   zipWriter.close(callback);
                   });
                   });
                   //}, onerror);
                   */

              },
              function(response) {
                  // Failure. :( Show error, but leave form available for retry.
                  Asana.ServerModel.logEvent({
                      name: "ChromeExtension-CreateTask-Failure"
                  });
                  me.setAddWorking(false);
                  me.showError(response.errors[0].message);
              });
      };


      $.when(prepTags())
          .then($.when(prepProjects())
                  .then(createTask()));
  },

  /**
   * Helper to show a success message after a task is added.
   */
  showSuccess: function(task) {
    var me = this;
    Asana.ServerModel.taskViewUrl(task, function(url) {
      var name = task.name.replace(/^\s*/, "").replace(/\s*$/, "");
      var link = $("#new_task_link");
        url = url + "/f";
      link.attr("href", url);
      link.text(name !== "" ? name : "Task");
        /*
      link.unbind("click");
      link.click(function() {
        chrome.tabs.create({url: url});
        window.close();
        return false;
      });
        */
      // Reset logging for multi-add
      me.has_edited_name = true;
      me.has_edited_notes = true;
      me.has_reassigned = true;
      me.is_first_add = false;

      $("#success").css("display", "inline-block");
    });
  },

  /**
   * Show the login page.
   */
  showLogin: function(login_url, signup_url) {
    var me = this;
    $("#login_button").click(function() {
      chrome.tabs.create({url: login_url});
      window.close();
      return false;
    });
    $("#signup_button").click(function() {
      chrome.tabs.create({url: signup_url});
      window.close();
      return false;
    });
    me.showView("login");
  },

  firstInput: function() {
    return $("#workspace_select");
  },

  lastInput: function() {
    return $("#add_button");
  }
};

/**
 * A jQuery-based typeahead similar to the Asana application, which allows
 * the user to select another user in the workspace by typing in a portion
 * of their name and selecting from a filtered dropdown.
 *
 * Expects elements with the following IDs already in the DOM
 *   ID: the element where the current assignee will be displayed.
 *   ID_input: an input element where the user can edit the assignee
 *   ID_list: an empty DOM whose children will be populated from the users
 *       in the selected workspace, filtered by the input text.
 *   ID_list_container: a DOM element containing ID_list which will be
 *       shown or hidden based on whether the user is interacting with the
 *       typeahead.
 *
 * @param id {String} Base ID of the typeahead element.
 * @constructor
 */
UserTypeahead = function(id) {
  var me = this;
  me.id = id;
  me.users = [];
  me.filtered_users = [];
  me.user_id_to_user = {};
  me.selected_user_id = null;
  me.user_id_to_select = null;
  me.has_focus = false;
  me.selected = false;

  // Store off UI elements.
  me.input = $("#" + id + "_input");
  me.label = $("#" + id);
  me.list = $("#" + id + "_list");
  me.list_container = $("#" + id + "_list_container");

  // Open on focus.
  me.input.focus(function() {
    me.user_id_to_select = me.selected_user_id;
    if (me.selected_user_id !== null) {
      // If a user was already selected, fill the field with their name
      // and select it all.
      var assignee_name = me.user_id_to_user[me.selected_user_id].name;
      me.input.val(assignee_name);
    } else {
      me.input.val("");
    }
    me.has_focus = true;
    Popup.setExpandedUi(true);
    me._updateFilteredUsers();
    me.render();
    me._ensureSelectedUserVisible();
  });

  // Close on blur. A natural blur does not cause us to accept the current
  // selection - there had to be a user action taken that causes us to call
  // `confirmSelection`, which would have updated user_id_to_select.
  me.input.blur(function() {
    // If the user deleted the content - don't assign the task.
    if(me.input.val() == "" && !(me.selected === true))
        me.selected_user_id = null;
    else
        me.selected_user_id = me.user_id_to_select;
    me.has_focus = false;
    me.selected = false;
    if (!Popup.has_reassigned) {
      Popup.has_reassigned = true;
      Asana.ServerModel.logEvent({
        name: (me.selected_user_id === Popup.user_id || me.selected_user_id === null) ?
            "ChromeExtension-AssignToSelf" :
            "ChromeExtension-AssignToOther"
      });
    }
    me.render();
    Popup.setExpandedUi(false);
  });

  // Handle keyboard within input
  me.input.keydown(function(e) {
    if (e.which === 13) {
      // Enter accepts selection, focuses next UI element.
      me._confirmSelection();
      $("#add_button").focus();
      return false;
    } else if (e.which === 9) {
      // Tab accepts selection. Browser default behavior focuses next element.
      me._confirmSelection();
      return true;
    } else if (e.which === 27) {
      // Abort selection. Stop propagation to avoid closing the whole
      // popup window.
      e.stopPropagation();
      me.input.blur();
      return false;
    } else if (e.which === 40) {
      // Down: select next.
      var index = me._indexOfSelectedUser();
      if (index === -1 && me.filtered_users.length > 0) {
        me.setSelectedUserId(me.filtered_users[0].id);
      } else if (index >= 0 && index < me.filtered_users.length) {
        me.setSelectedUserId(me.filtered_users[index + 1].id);
      }
      me._ensureSelectedUserVisible();
      e.preventDefault();
    } else if (e.which === 38) {
      // Up: select prev.
      var index = me._indexOfSelectedUser();
      if (index > 0) {
        me.setSelectedUserId(me.filtered_users[index - 1].id);
      }
      me._ensureSelectedUserVisible();
      e.preventDefault();
    }
  });

  // When the input changes value, update and re-render our filtered list.
  me.input.bind("input", function() {
    me._updateFilteredUsers();
    me._renderList();
  });

  // A user clicking or tabbing to the label should open the typeahead
  // and select what's already there.
  me.label.focus(function() {
    me.input.focus();
    me.input.get(0).setSelectionRange(0, me.input.val().length);
  });

  me.render();
};

Asana.update(UserTypeahead, {

  SILHOUETTE_URL: "./nopicture.png",

  /**
   * @param user {dict}
   * @returns {jQuery} photo element
   */
  photoForUser: function(user) {
    var photo = $('<div class="user-photo"></div>"');
    var url = user.photo ? user.photo.image_60x60 : UserTypeahead.SILHOUETTE_URL;
    photo.css("background-image", "url(" + url + ")");
    return $('<div class="user-photo-frame"></div>').append(photo);
  }

});

Asana.update(UserTypeahead.prototype, {

  /**
   * Render the typeahead, changing elements and content as needed.
   */
  render: function() {
    var me = this;
    me._renderLabel();

    if (this.has_focus) {
      // Focused - show the list and input instead of the label.
      me._renderList();
      me.input.show();
      me.label.hide();
      me.list_container.show();
    } else {
      // Not focused - show the label, not the list or input.
      me.input.hide();
      me.label.show();
      me.list_container.hide();
    }
  },

  /**
   * Update the set of all (unfiltered) users available in the typeahead.
   *
   * @param users {dict[]}
   */
  updateUsers: function(users) {
    var me = this;
    // Build a map from user ID to user
    var this_user = null;
    var users_without_this_user = [];
    me.user_id_to_user = {};
    users.forEach(function(user) {
      if (user.id === Popup.user_id) {
        this_user = user;
      } else {
        users_without_this_user.push(user);
      }
      me.user_id_to_user[user.id] = user;
    });

    // Put current user at the beginning of the list.
    // We really should have found this user, but if not .. let's not crash.
    me.users = this_user ?
        [this_user].concat(users_without_this_user) : users_without_this_user;

    // If selected user is not in this workspace, unselect them.
    if (!(me.selected_user_id in me.user_id_to_user)) {
      me.selected_user_id = null;
      me.input.val("");
    }
    me._updateFilteredUsers();
    me.render();
  },

  _renderLabel: function() {
    var me = this;
    me.label.empty();
    var selected_user = me.user_id_to_user[me.selected_user_id];
    if (selected_user) {
      if (selected_user.photo) {
        me.label.append(UserTypeahead.photoForUser(selected_user));
      }
      me.label.append($('<div class="user-name">').text(selected_user.name));
    } else {
      me.label.append($('<span class="unassigned">').text("Assignee"));
    }
  },

  _renderList: function() {
    var me = this;
    me.list.empty();
    me.filtered_users.forEach(function(user) {
      me.list.append(me._entryForUser(user, user.id === me.selected_user_id));
    });
  },

  _entryForUser: function(user, is_selected) {
    var me = this;
    var node = $('<div id="user_' + user.id + '" class="user"></div>');
    node.append(UserTypeahead.photoForUser(user));
    node.append($('<div class="user-name">').text(user.name));
    if (is_selected) {
      node.addClass("selected");
    }

    // Select on mouseover.
    node.mouseenter(function() {
      me.setSelectedUserId(user.id);
    });

    // Select and confirm on click. We listen to `mousedown` because a click
    // will take focus away from the input, hiding the user list and causing
    // us not to get the ensuing `click` event.
    node.mousedown(function() {
      me.setSelectedUserId(user.id);
      me._confirmSelection();
    });
    return node;
  },

  /**
   * Generates a regular expression that will match strings which contain words
   * that start with the words in filter_text. The matching is case-insensitive
   * and the matching words do not need to be consecutive but they must be in
   * the same order as those in filter_text.
   *
   * @param filter_text {String|null} The input text used to generate the regular
   *  expression.
   * @returns {Regexp}
   */
  _regexpFromFilterText: function(filter_text) {
    if (!filter_text || filter_text.trim() === '') {
      return null;
    } else {
      var escaped_filter_text = RegExp.escape(
          filter_text.trim(),
          /*opt_do_not_escape_spaces=*/true);
      var parts = escaped_filter_text.trim().split(/\s+/).map(function(word) {
        return "(" + word + ")";
      }).join("(.*\\s+)");
      return new RegExp("(?:\\b|^|(?=\\W))" + parts, "i");
    }
  },

  _confirmSelection: function() {
    this.user_id_to_select = this.selected_user_id;
    this.selected = true;
  },

  _updateFilteredUsers: function() {
    var regexp = this._regexpFromFilterText(this.input.val());
    this.filtered_users = this.users.filter(function(user) {
      if (regexp !== null) {
        var parts = user.name.split(regexp);
        return parts.length > 1;
      } else {
        return user.name.trim() !== "";  // no filter
      }
    });
  },

  _indexOfSelectedUser: function() {
    var me = this;
    var selected_user = me.user_id_to_user[me.selected_user_id];
    if (selected_user) {
      return me.filtered_users.indexOf(selected_user);
    } else {
      return -1;
    }
  },

  /**
   * Helper to call this when the selection was changed by something that
   * was not the mouse (which is pointing directly at a visible element),
   * to ensure the selected user is always visible in the list.
   */
  _ensureSelectedUserVisible: function() {
    var index = this._indexOfSelectedUser();
    if (index !== -1) {
      var node = this.list.children().get(index);
      Asana.Node.ensureBottomVisible(node);
    }
  },

  setSelectedUserId: function(id) {
    if (this.selected_user_id !== null) {
      $("#user_" + this.selected_user_id).removeClass("selected");
    }
    this.selected_user_id = id;
    if (this.selected_user_id !== null) {
      $("#user_" + this.selected_user_id).addClass("selected");
    }
    this._renderLabel();
  }

});


$(window).load(function() {
  Popup.onLoad();
});
