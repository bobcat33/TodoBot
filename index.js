// Imports
const Discord = require("discord.js");
const MySQL = require('mysql');
const util = require('util');

// Config
const client = new Discord.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"], partials: ['CHANNEL'] });

const { prefix, admins,
    dbHost, dbPort, dbUser, dbPass, dbName, tableName,
    defaultColour, errorColour, warnColour, cancelColour, successColour, helpColour, todoBasicColour, todoCompleteColour, todoUncompleteColour, todoCreatedColour, todoRemovedColour,
    maxTitleLength, maxDescriptionLength,
    token 
} = require("./config.json");

// The properties of each command follow the following rules:
// - name (required) - String of the name of the command, used in the help command embed as the title
// - command (required) - String of the main command used to run
// - description (required) - String used for quickly describing the command in the general help menu
// - usage (required) - String used for quickly showing the general usage of the command in error messages and things, should be short and on one line
// - help (required) - String used in the body of the help command embed for the command
// - aliases (not required) - An array of the aliases (as strings) that a user can enter to use a command, for example to set up the database using the init command the user could instead use an alias in the place of init
// - permittedUsers (not required) - An array of user IDs (as strings) that are permitted to use the command, if the array is empty all users will be able to use the command. Set to [""] to disallow all users
const commands = {
    help: {
        name: "Help Command",
        command: "help",
        description: "Get help with commands.",
        usage: `${prefix}help`,
        help: `${prefix}help <command>`,
    },
    init: {
        name: "Setup Command",
        command: "init",
        description: "Set up the To-Do list database.",
        usage: `${prefix}init`,
        help: `\*\*Commands:\*\*\n\`${prefix}init\`: Set up the todo list database.`,
        aliases: ["setup", "initialise"],
        permittedUsers: admins
    },
    todo: {
        name: "Todo Command",
        command: "todo",
        description: "List all To-Dos or specify one to view.",
        usage: `${prefix}todo`,
        help: `\*\*Commands:\*\*\n\`${prefix}todo\`: View all items on you To-Do list.\n\`${prefix}todo <ID | Title>\`: View a specific To-Do on your list.`,
        aliases: ["list"]
    },
    add: {
        name: "Add Item Command",
        command: "add",
        description: "Add an item to your To-Do list",
        usage: `${prefix}add <to-do>`,
        help: `In the below commands the value for \`date\` can be a combination of any of the following values:\n - \`DD/MM/YYYY\`: Set the day, month and year\n - \`DD/MM\`: Set the day and month - the year is the current year\n - \`hh:mm:ss\`: Set hours, minutes and seconds\n - \`hh:mm\`: Set hours and minutes\n - \`now\`: Any unspecified values will use the current time\n - \`tomorrow\`: If the date is not specified will set it to the day after the current date\n - \`yesterday\`: If the date is not specified will set it to the day before the current date\n\nOr you can use relative modifiers in the format \`<value><modifier>\` where \`value\` is any integer and \`modifier\` is one of the following (case-sensitive):\n - \`s\`: Seconds\n - \`m\`: Minutes\n - \`h\`: Hours\n - \`D\`: Days\n - \`W\`: Weeks\n - \`M\`: Months\n - \`Y\`: Years\n\n\*\*Commands:\*\*\n\`${prefix}add <title>\`: Add an item to your To-Do list with just a title.\n\`${prefix}add "<title>" <date>\`: Add an item to your To-Do list with both a title and a date (optional).\n\`${prefix}add "<title>" "<description>" <date>\`: Add an item to your To-Do list with a title, a description and a date (optional).`,
        aliases: ["create", "new"]
    },
    remove: {
        name: "Remove Item Command",
        command: "remove",
        description: "Remove all items or a specific item from your To-Do list",
        usage: `${prefix}remove`,
        help: `\*\*Commands:\*\*\n\`${prefix}remove\`: Remove all items from your To-Do list, this includes both completed and uncompleted To-Dos.\n\`${prefix}remove <ID | Title>\`: Remove a specific item from your To-Do list.`,
        aliases: ["delete"]
    },
    complete: {
        name: "Complete To-Do",
        command: "complete",
        description: "Mark To-Dos as complete",
        usage: `${prefix}complete`,
        help: `\*\*Commands:\*\*\n\`${prefix}complete\`: Complete all items on your To-Do list at once.\n\`${prefix}complete <ID | Title>\`: Complete a specific item on your To-Do list.`,
        aliases: ["finish", "done"]
    },
    uncomplete: {
        name: "Uncomplete To-Do",
        command: "uncomplete",
        description: "Mark To-Dos as uncomplete",
        usage: `${prefix}uncomplete`,
        help: `\*\*Commands:\*\*\n\`${prefix}uncomplete\`: Uncomplete all items on your To-Do list at once.\n\`${prefix}uncomplete <ID | Title>\`: Uncomplete a specific item on your To-Do list.`,
        aliases: ["start", "restart"]
    }
}

const SQL = {
    checkDatabaseExists: `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${dbName}';`,
    deleteDatabase: `DROP DATABASE IF EXISTS ${dbName};`,
    createDatabase: `CREATE DATABASE IF NOT EXISTS ${dbName};`,
    checkTableExists: `SHOW TABLES LIKE '${tableName}';`,
    createTable: `CREATE TABLE IF NOT EXISTS ${tableName} (id INT NOT NULL AUTO_INCREMENT UNIQUE KEY PRIMARY KEY, userID varchar(20) NOT NULL, title varchar(${maxTitleLength}) NOT NULL, description varchar(${maxDescriptionLength}) NOT NULL, completeDate datetime, createDate datetime NOT NULL, completed bool NOT NULL);`,
    getUserTodos: userID => `SELECT * FROM ${tableName} WHERE userID = '${userID}';`,
    getTodo: todoID => `SELECT * FROM ${tableName} WHERE id = ${MySQL.escape(todoID)};`,
    addTodo: (userID, title, description, completeDate) => {
        // If the first parameter is a ToDo then instead use the values from it
        if (userID instanceof ToDo) {
            title = userID.title;
            description = userID.description;
            completeDate = userID.completeDate;
            userID = userID.userID;
        }
        let usingCompleteDate = !(typeof completeDate === 'undefined');
        let fields = `userID, title, description, ${(usingCompleteDate) ? "completeDate, " : ""}createDate, completed`;
        let values = `'${userID}', ${MySQL.escape(title.substring(0, maxTitleLength))}, ${MySQL.escape(description.substring(0, maxDescriptionLength))}, ${(usingCompleteDate) ? `${MySQL.escape(completeDate)}, ` : ""}CURRENT_TIMESTAMP(), FALSE`;
        return `INSERT INTO ${tableName} (${fields}) VALUES (${values});`;
    },
    removeTodo: id => `DELETE FROM ${tableName} WHERE id = ${MySQL.escape(id)};`,
    removeUserTodos: id => `DELETE FROM ${tableName} WHERE userID = ${MySQL.escape(id)};`,
    setTodoCompleted: (id, complete) => `UPDATE ${tableName} SET completed = ${(typeof complete === 'undefined') ? "TRUE" : complete.toString().toUpperCase()} WHERE id = ${MySQL.escape(id)};`,
    setAllCompleted: (userID, complete) => `UPDATE ${tableName} SET completed = ${(typeof complete === 'undefined') ? "TRUE" : complete.toString().toUpperCase()} WHERE userID = ${MySQL.escape(userID)};`
}



// Classes

// To-Do item class for storing and loading To-Do details
class ToDo {
    #id; #user; #header; #desc; #date; #complete;

    constructor(id, title, description, completeDate, completed, userID) {
        // Assume that if id is an object it is a RowDataPacket and use the data from that to create the ToDo
        if (typeof id === 'object') {
            this.userID = id.userID;
            this.title = id.title;
            this.description = id.description;
            this.completeDate = id.completeDate;
            this.completed = id.completed;
            this.todoID = id.id;
        }

        else {
            this.todoID = id;
            this.userID = userID;
            this.title = title;
            this.description = description;
            this.completeDate = completeDate;
            this.completed = completed;
        }
    }

    // Throw an error if the id is null
    get todoID() { return this.#id; }
    set todoID(id) {
        if (id === null) throw "ID CANNOT BE NULL";
        this.#id = id;
    }

    // If the userID is null store it as undefined
    get userID() { return this.#user; }
    set userID(id) {
        this.#user = (id === null) ? undefined : id;
    }

    // Throw an error if the title is null
    get title() { return this.#header; }
    set title(title) {
        if (title === null) throw "TITLE CANNOT BE NULL";
        this.#header = title;
    }

    // Store the description as "" if it's null
    get description() { return this.#desc; }
    set description(description) {this.#desc = (description === null) ? "" : description;}
    
    // If the date is null store it as undefined
    get completeDate() { return this.#date; }
    set completeDate(completeDate) {
        this.#date = (completeDate === null) ? undefined : completeDate;
    }
    
    // Throw an error if the completed value is null
    get completed() { return this.#complete; }
    set completed(completed) {
        if (completed === null) throw "COMPLETED CANNOT BE NULL";
        // Will store as false if the value passed is "false" or "0", otherwise will store true.
        this.#complete = (completed == 0) ? false : true;
    }

    // Get the date in unix form, returns null if the date is not defined
    get unixCompleteDate() {
        if (typeof this.#date === 'undefined') return null;
        return new Date(this.#date).getTime() / 1000;
    }

    // Get the date as a printable sentence
    getDatePrintable() {
        if (typeof this.#date === 'undefined') return "";
        var date = this.unixCompleteDate;
        return `Complete by <t:${date}> (<t:${date}:R>)`;
    }

    // Get the whole To-Do as a string that can be displayed in discord
    getPrintable() {
        return `\*\*${this.#header}\*\*${(this.#desc === "") ? "" : `\n${this.#desc}`}${(typeof this.#date === 'undefined') ? "" : `\n\n${this.getDatePrintable()}`}`;
    }
}

// To-Do List class for storing a list of To-Dos
class ToDoList {
    #list; #userID;

    constructor(list, userID) {
        this.#userID = userID;
        this.#list = list.map(item => {
            // Can't check if instance of RowDataPacket so instead checks that it's an instance of ToDo or an object, otherwise it's filtered out
            if (item instanceof ToDo) return item;
            if (typeof item === 'object') return new ToDo(item);
        });
        if (typeof userID !== 'undefined') {
            this.#list = this.#list.filter(item => item.userID === userID);
        }
        this.sort();
    }

    getAll() {
        return this.#list;
    }

        // Returns the ToDo object that relates most to the identifier
        get(identifier) {
        if (typeof identifier === 'string') {
            // Attempt to convert the string to a number
            var int = parseInt(identifier);
            // Check if the whole string was a number, if it was replace the identifier with its number form
            if (typeof int === 'number' && int.toString().length === identifier.length) identifier = int;
        }

        if (typeof identifier === 'number') {
            // Search for a ToDo object in the list that's ID is the same as the identifier
            for (var todo of this.#list) {
                if (todo.todoID === identifier) {
                    return todo;
                }
            }

            // If a To-Do was not found, convert the identifier back to a string and continue with other searches
            identifier = identifier.toString();
        }

        // Check if any match the search term exactly
        for (var todo of this.#list) {
            if (todo.title === identifier) return todo;
        }

        // Check if any match the search term, ignoring case
        for (var todo of this.#list) {
            if (todo.title.toLowerCase() === identifier.toLowerCase()) return todo;
        }

        // Check if any start with the search term
        for (var todo of this.#list) {
            if (todo.title.toLowerCase().startsWith(identifier.toLowerCase())) return todo;
        }

        // Check if any end with the search term
        for (var todo of this.#list) {
            if (todo.title.toLowerCase().endsWith(identifier.toLowerCase())) return todo;
        }

        // Check if any contain the search term
        for (var todo of this.#list) {
            if (todo.title.toLowerCase().includes(identifier.toLowerCase())) return todo;
        }

        // Catch spelling errors by finding the shortest distance using the Levenshtein algorithm
        var lowestDistance = Infinity;
        var relevantTodo = null;

        for (const todo of this.#list) {
            let currentDifference = levenshtein(todo.title, identifier);
            if (currentDifference === 0) return todo;
            if (currentDifference < lowestDistance) {
                lowestDistance = currentDifference;
                relevantTodo = todo;
            }
        }

        return relevantTodo;
    }

    getPrintable(separateDated, separateCompleted, includeCompleted) {
        separateDated = (typeof separateDated === 'undefined') ? true : separateDated;
        separateCompleted = (typeof separateCompleted === 'undefined') ? true : separateCompleted;
        includeCompleted = (typeof includeCompleted === 'undefined') ? true : includeCompleted;

        var uncomplete = [];
        var complete = [];
        var noDate = [];

        for (var todo of this.#list) {
            if (separateCompleted && todo.completed) complete.push(todo);
            else uncomplete.push(todo);
        }

        if (separateDated) {
            var split = this.splitList(uncomplete);

            noDate = split.noDate;
            uncomplete = split.withDate;
        }

        var outString = "";

        for (var todo of uncomplete) {
            outString += `\n\`${todo.todoID}\` - \*\*${todo.title}\*\*${(separateDated) ? `\n\*${todo.getDatePrintable()}\*` : ""}`;
        }

        if (separateDated && noDate.length > 0) {
            outString += (uncomplete.length > 0) ? "\n\n\*\*\_\_No Date\_\_\*\*" : "";
            for (var todo of noDate) {
                outString += `\n\`${todo.todoID}\` - \*\*${todo.title}\*\*`;
            }
        }

        if (includeCompleted && complete.length > 0) {
            outString += "\n\n\*\*\_\_Completed\_\_\*\*";
            for (var todo of complete) {
                outString += `\n\`${todo.todoID}\` - \*\*${todo.title}\*\*`;
            }
        }

        return (outString.length > 0) ? "\`ID\` - \*\*Title\*\*\n------------" + outString : `You have not got any To-Dos on your list, use the command \`${prefix}add\` to make one.`;
    }

    sort() {
        let todos = this.splitList();

        let n = todos.withDate.length;
        for (let i = 1; i < n; i++) {
            // Choosing the first element in our unsorted subarray
            let current = todos.withDate[i];
            // The last element of our sorted subarray
            let j = i-1;
            while ((j > -1) && (current.unixCompleteDate < todos.withDate[j].unixCompleteDate)) {
                todos.withDate[j+1] = todos.withDate[j];
                j--;
            }
            todos.withDate[j+1] = current;
        }

        this.#list = todos.withDate.concat(todos.noDate);
    }

    splitList(list) {
        list = (typeof list === 'undefined') ? this.#list : list;
        return list.reduce((out, currentTodo) => {
            out[(typeof currentTodo.completeDate === 'undefined') ? 'noDate' : 'withDate'].push(currentTodo);
            return out;
        }, { noDate: [], withDate: []});
    }

}



// Functions

// Parse the arguments from a command
// - string is the command to parse
// - numargs is the number of argumants to parse, if includeCommand is true this number includes the command word.
// This parameter is used to allow for the last argument in a command to be any number of words long - for example if string is "hello this is an example string",
// numargs is 3 and includeCommand is false then the return will be ["this", "is", "an example string"] because the command word was not included and it only wanted 3 arguments
// - includeCommand defaults to false - if its false the actual command word (the first argument) is removed before proceeding, if true the command is included as an argument in the returned list
function getArgs(string, numargs, includeCommand) {
	includeCommand = (typeof includeCommand === 'undefined') ? false : includeCommand; // Defaults to false
	numargs = (numargs <= 0) ? numargs : numargs-1;

	var baseargs = string.split(" ");
    // Remove the command word if it is not required
	if (!includeCommand)
		baseargs.splice(0, 1);

    // Add all the normal arguments to the array
	var args = [];
	for (i=0;i<numargs;i++) {
		if (i === baseargs.length)
			return args; // If there are no extra arguments return the finished array

		args.push(baseargs[i]);
	}

    // Add the extra arguments to the last element
	var finalargs = baseargs.splice(numargs);
	if (finalargs.length !== 0)
		args.push(finalargs.join(" "));

	return args;
}

// Parse the string for arguments wrapped by "", if includeNonString is true anything left over after removing the string arguments will be included in the return value.
function getStringArgs(string, includeNonString) {
	includeNonString = (typeof includeNonString === 'undefined') ? true : includeNonString;

    var startIndex = -2; // Must start being less than endIndex
    var endIndex = -1; // Must start being less than 0
    var args = [];
    var nonString = string;
    var nonStringIndexModifier = 0;

    for (var i=0;i < string.length;i++) {
        // Skip over escaped " characters
        if (string.charAt(i) === "\\" && string.charAt(i + 1) === '"') {
            i++;
        } else if (string.charAt(i) === '"') {
            // Check if this is a new argument, if so store the starting index as the current position and start searching for the end index
            if (startIndex < endIndex)
                startIndex = i;
            else {
                // If this is not the first quotation mark then store the current position as the endIndex and append the string between the quotations to the arguments list
                endIndex = i;
                // When pushing to the array replace all escaped quotation marks with normal quotations
                args.push(string.substring(startIndex + 1, endIndex).replaceAll('\\"', '"'));
                if (includeNonString) {
                    // If including the values that are not surrounded by quotation marks then remove the argument that has been found from the string of values that are not arguments
                    nonString = nonString.substring(0, startIndex - nonStringIndexModifier) + nonString.substring(endIndex + 1 - nonStringIndexModifier);
                    nonStringIndexModifier += endIndex + 1 - startIndex;
                }
            }
        }
    }

    // If includeNonString is true, return an object with an array of string arguments stored in response.stringArgs and anything extra stored as a string in response.extraArgs
    if (includeNonString) {
        var response = {
            stringArgs: args,
            extraArgs: nonString.replaceAll('\\"', '"').trim()
        };
        return response;
    }
    
    // if includeNonString is false just return an array of all the arguments surrounded by quotes
    return args;

}

// Test if string is a command
function isCommand(commandName) {
    for (const possibleCommand in commands) {
        if (commands[possibleCommand].command === commandName) return true;
        if (isAliasOf(commands[possibleCommand], commandName)) return true;
    }
    return false;
}

// Get the command object from an alias, returns "" if a command does not exist with the specified alias
function getCommand(alias) {
    for (const possibleCommand in commands) {
        if (isAliasOf(commands[possibleCommand], alias)) return possibleCommand;
    }
    return "";
}

// Check if "commandName" is the command for "command"
function isCommandFor(command, commandName) { return (command.command === commandName); }

// Check if "aliasName" is an alias of "command", command must be one of "commands"
function isAliasOf(command, aliasName) { return (typeof command.aliases !== 'undefined' && command.aliases.includes(aliasName)); }

// Check if the user denoted by their "userID" is permitted to use the command "command"
function isPermitted(userID, command, message) {
    const permitted = (typeof command.permittedUsers === 'undefined' || command.permittedUsers.length === 0 || command.permittedUsers.includes(userID));
    if (typeof message !== 'undefined' && !permitted) replyEmbed(message, quickembed("Error - Lacking Permission", "You are not permitted to use that command!", errorColour));
    return permitted;
}

// Use all three of the above functions to validate if a user is permitted to run a command and that it is referring to the command "command"
function validateUserCommand(userID, command, inputCommand, message) { return ((isCommandFor(command, inputCommand) || isAliasOf(command, inputCommand)) && isPermitted(userID, command, message)) }

// Convert a user input into the form "YYYY-MM-DD hh:mm:ss"
function formatTime(timeInput) {
    // [^\s] doesnt count any kind of space before or after the regex, this means things like : or :22 are not counted, it also allows for negative relative modifiers
    var numDateDelims = value => (value.match(/[^\s](\/|\\|-|\.)[^\s]/g) || []).length; // Get the total number of "/", "\", "-" and "."
    var isDate = numDelims => (numDelims <= 2 && numDelims > 0);
    var numTimeDelims = value => (value.match(/[^\s]:[^\s]/g) || []).length; // Get the total number of ":"
    var isTime = numDelims => (numDelims <= 2 && numDelims > 0);
    
    var currentDate = new Date();
    var modifierDate = new Date(currentDate.getTime());
    var date = "";
    var time = "";

    var inputArray = timeInput.split(" ");

    for (var value of inputArray) {
        timeDelims = numTimeDelims(value);
        dateDelims = numDateDelims(value);

        if (isDate(dateDelims) && isTime(timeDelims)) continue; // If the value contains both date delimiters and time delimiters it is most likely an error and should be avoided

        else if (isDate(dateDelims)) {

            // Flip the input and replace the delimiters with "-", i.e. "1/2/3" will become "3-2-1"
            if (dateDelims === 2) {
                date = value.replace(/(.*)(\/|\\|-|\.)(.*)(\/|\\|-|\.)(.*)/g, "$5-$3-$1");
            }
            else if (dateDelims === 1) {
                date = value.replace(/(.*)(\/|\\|-|\.)(.*)/g, `${currentDate.getFullYear()}-$3-$1`); // If the user only specifies the date and month insert the current year
            }

        }

        else if (isTime(timeDelims)) {
            time = value;
        }

        else {

            if (value.toLowerCase() === "now") {
                // Add one to the timestamp so that the modifier date is ever so slightly different from currentDate and the end result is modified
                modifierDate.setTime(modifierDate.getTime() + 1);
            }

            // Add a day
            else if (value.toLowerCase() === "tomorrow") {
                modifierDate.setDate(modifierDate.getDate() + 1);
            }
            
            // Remove a day
            else if (value.toLowerCase() === "yesterday") {
                modifierDate.setDate(modifierDate.getDate() - 1);
            }

            else {
                // Optionally have a negative at the start, otherwise require a number followed by a modifier - e.g. 32D
                var matched = value.match(/(?<negative>-)?(?<value>[0-9]+)(?<modifier>s|m|h|D|W|M|Y)/);
                if (matched !== null) {

                    let value = parseInt(matched.groups.value);
                    let modifier = matched.groups.modifier;

                    // Make the value negative if the negative sign was used
                    value = (-1 + (typeof matched.groups.negative === 'undefined') * 2) * value;

                    if (modifier === "s") { modifierDate.setSeconds(modifierDate.getSeconds() + value); }
                    else if (modifier === "m") { modifierDate.setMinutes(modifierDate.getMinutes() + value); }
                    else if (modifier === "h") { modifierDate.setHours(modifierDate.getHours() + value); }
                    else if (modifier === "D") { modifierDate.setDate(modifierDate.getDate() + value); }
                    else if (modifier === "W") { modifierDate.setDate(modifierDate.getDate() + value * 7); }
                    else if (modifier === "M") { modifierDate.setMonth(modifierDate.getMonth() + value); }
                    else if (modifier === "Y") { modifierDate.setFullYear(modifierDate.getFullYear() + value); }

                }
            }
        }

    }

    // If the time or date isn't specified and the modifierDate has been changed then set the relevant value using the modifierDate
    if (modifierDate.getTime() !== currentDate.getTime()) {
        date = (date === "") ? `${modifierDate.getFullYear()}-${modifierDate.getMonth() + 1}-${modifierDate.getDate()}` : date;
        time = (time === "") ? `${modifierDate.getHours()}:${modifierDate.getMinutes()}:${modifierDate.getSeconds()}` : time;
    }

    // If date is still not set then set it to the current date, if time isn't set then set it to midnight
    date = (date === "") ? `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}` : date;
    time = (time === "") ? `00:00:00` : time;

    return date + " " + time;

}

// Function to quickly generate an embed or an array of embeds if the content is too long to fit in one
function quickembed(header, content, colour) {
    // IF the header value is a ToDo, translate the ToDo into an embed
    if (header instanceof ToDo) {
        content = header.description + ((typeof header.completeDate !== 'undefined') ? ((header.description === "") ? "" : "\n\n") + header.getDatePrintable() : "");
        colour = (header.completed) ? todoCompleteColour : todoUncompleteColour;
        header = header.title;
    }

	var colour = (typeof colour !== 'undefined') ? colour : defaultColour;


    // If the content is greater than the max number of characters that a Discord embed can contain then split the content across two embeds and return as an array of embeds
    // A Discord embed can have a maximum description length of 4096 and a message can have a total embed text length of 6000
    // Any extra text is lost to avoid having to create embeds across multiple messages as this function is used to create embeds for a single message
    if (content.length > 4096) {
        return [new Discord.MessageEmbed().setColor(colour).setTitle(header).setDescription(content.substring(0, 4096)), new Discord.MessageEmbed().setColor(colour).setDescription(content.substring(4096, 6000 - header.length))];
    }
    else return new Discord.MessageEmbed().setColor(colour).setTitle(header).setDescription(content);
}

// Update the embed on a message to a new embed
function editEmbed(message, newEmbed) { message.edit({embeds: (Array.isArray(newEmbed)) ? newEmbed : [newEmbed]}); }

// Remove the buttons on a message
function removeButtons(message) { message.edit({components: []}); }

// Functions to send embeds to channels or reply to messages
function channelEmbed(channel, embed) { return channel.send({embeds : (Array.isArray(embed)) ? embed : [embed]}); }
function replyEmbed(message, embed) { return message.reply({embeds : (Array.isArray(embed)) ? embed : [embed]}); }

// Function to apply buttons to an embed and send it
// - Set reply to true to reply to the message (otherwise will send message in the message's channel)
// - Set allowOnlySender to true to only accept button presses from the sender of the message
// - The limit value can be an empty object (for no limits or end events) or contain the following properties:
//   > max: number - The maximum number of times the buttons can be interacted with
//   > timeout: number - The number of milliseconds that the buttons until the collector ends
//   > removeButtons: boolean - Set to true to remove the buttons when the limit is reached (defaults to false)
//   > endFunction: function(message) - Callback function that is run when the limit is reached, parameter is the message that contains the buttons
// - Buttons should be in the form {id, label, style, async trigger(interaction)}
// - Button styles can be one of the following: PRIMARY | SECONDARY | SUCCESS | DANGER | LINK
async function sendButtonEmbed(message, embed, reply, allowOnlySender, limits, ...buttons) {
    // If no buttons have been passed then just use the normal functions
    if (buttons.length === 0) {
        (reply) ? replyEmbed(message, embed) : channelEmbed(message.channel, embed);
        return;
    }

    var embeds = (Array.isArray(embed)) ? embed : [embed]; // Turn the embed value into an array if it wasn't already

    const buttonRow = new Discord.MessageActionRow();

    // Add each button to the row
    for (const button of buttons) {
        buttonRow.addComponents(new Discord.MessageButton()
            .setCustomId(button.id)
            .setLabel(button.label)
            .setStyle(button.style));
    }

    // Create a filter for collecting interactions, this will only accept button presses and if allowOnlySender is true than only the sender of the command can press the buttons successfully
    const filter = i => (i.componentType === 'BUTTON' && (!allowOnlySender || message.author.id === i.user.id));

    // Send the message with the buttons and embeds attached
    const sentMessage = (reply) ? await message.reply({ embeds: embeds, components: [buttonRow] }) : await message.channel.send({ embeds: embeds, components: [buttonRow] });

    // Create a collector for the message
    var collector = sentMessage.createMessageComponentCollector({filter, max: limits.max, time: limits.timeout});

    // Add a button press listener to the collector
    collector.on('collect', async interaction => {
        if (interaction.componentType !== 'BUTTON') return;

        for (const button of buttons) {
            if (button.id === interaction.customId) {
                await button.trigger(interaction);
                return;
            }
        }
    });

    // Add a listener to the collector for when it closes
    collector.on('end', () => {
        if (typeof limits.removeButtons === 'boolean' && limits.removeButtons) removeButtons(sentMessage);
        if (typeof limits.endFunction === 'function') limits.endFunction(sentMessage);
    });
}

// Using the levenshtein algorithm, find the distance between two strings
// This algorthm was taken from https://gist.github.com/andrei-m/982927?permalink_comment_id=2059365#gistcomment-2059365 and was the most effecient version that I could find
function levenshtein(a, b){
	var tmp;
	if (a.length === 0) { return b.length; }
	if (b.length === 0) { return a.length; }
	if (a.length > b.length) { tmp = a; a = b; b = tmp; }

	var i, j, res, alen = a.length, blen = b.length, row = Array(alen);
	for (i = 0; i <= alen; i++) { row[i] = i; }

	for (i = 1; i <= blen; i++) {
		res = i;
		for (j = 1; j <= alen; j++) {
			tmp = row[j - 1];
			row[j - 1] = res;
			res = b[i - 1] === a[j - 1] ? tmp : Math.min(tmp + 1, Math.min(res + 1, row[j] + 1));
		}
	}
	return res;
}


// Query Functions

// Query a specific connection with one or more queries
async function queryConnection(connection, singleQuery, extraQueries) {
    // Set up variables for queries
    const queryPromise = util.promisify(connection.query).bind(connection);
    const closeConnection = util.promisify(connection.end).bind(connection);

    const query = async queryString => {
        console.log(`Executing query: ${queryString}`);

        var rows;
        try {
            rows = await queryPromise(queryString);
        } catch (error) {
            console.log(error);
            return error;
        }

        console.log("Response:");
        console.log(rows);

        return rows;
    };


    // Query the database

    var response;

    if (extraQueries.length === 0) {
        response = await query(singleQuery);
    }
    else {
        response = [await query(singleQuery)];

        for (const extraQuery of extraQueries) {
            const queryResponse = await query(extraQuery);

            response.push(queryResponse);

            if (queryResponse instanceof Error) break;
        }
    }


    // Close the connection to the database

    try {
        await closeConnection();
    } catch (error) {
        if (error.code === "ECONNREFUSED") {
            replyEmbed(msg, quickembed("Error - Disconnection Failed", "Failed to disconnect from database.", errorColour));
        }
        else if (error.code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR") {
            console.log("\nUnable to queue a disconnect after fatal error.");
        }
        else {
            replyEmbed(msg, quickembed("Error - Disconnection Failed", `Failed to disconnect from database. (Unexpected error code \`${error.code}\`)`, errorColour));
            console.log(error);
        }
    }

    console.log("Database connection closed.");

    return response;
}

// Create a connection to the main MySQL database to perform one or more queries
async function serverQuery(singleQuery, ...extraQueries) {
    console.log("Creating connection to (server) database...");

    const connection = MySQL.createConnection({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPass
    });

    return await queryConnection(connection, singleQuery, extraQueries);
    
}

// Create a connection to the To-Do database on the server to perform one or more queries
async function databaseQuery(singleQuery, ...extraQueries) {
    console.log(`Creating connection to "${dbName}" database...`);

    const connection = MySQL.createConnection({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPass,
        database: dbName
    });

    return await queryConnection(connection, singleQuery, extraQueries);
}

// Check for errors in a query response, if message is provided and an error is found the message will be responded to with a relevant error message
function checkQueryErrors(queryResponses, message) {
    const reply = (typeof message === 'undefined') ? false : true;

    // Create a function to check if an object is an error, if it is send an error message and return true, otherwise return false
    const check = object => {
        if (!(object instanceof Error)) return false;

        if (reply) {
            if (object.code === "ECONNREFUSED") {
                replyEmbed(message, quickembed("Error - Query Failed", "Failed to connect to database.", errorColour));
            }
            else if (object.code === "ER_ACCESS_DENIED_ERROR") {
                replyEmbed(message, quickembed("Error - Login Failed", `Failed to connect to database due to invalid login details.`, errorColour));
            }
            else if (object.code === "ER_PARSE_ERROR") {
                replyEmbed(message, quickembed("Error - Query Failed", `Invalid query may have caused internal errors.`, errorColour));
            }
            else {
                replyEmbed(message, quickembed("Error - Query Failed", `Failed to query database. (Unexpected error code \`${object.code}\`)\n\nFull Error:\n\`${object.sqlMessage}\``, errorColour));
            }
        }

        return true;
    }

    // If the responses are an array iterate through all of them, return true if an error is found and false if not
    if (queryResponses instanceof Array) {
        var containsError = false;

        for (const queryResponse of queryResponses) {
            if (check(queryResponse)) containsError = true;
        }

        return containsError;
    }
    else {
        return check(queryResponses);
    }
}



// Log when the client connects
client.once('ready', () => {
    console.log("Ready!");
});


// Create a message handler
client.on('messageCreate', async msg => {
    // If the message was sent by a bot, ignore it
    if (msg.author.bot) return;

    // Handle partial messages
    if (msg.partial) {
		msg.fetch()
			.then(fullMessage => {
				console.log(`\nINCOMING PARTIAL MESSAGE\n${fullMessage.author.username}:\n${fullMessage.content}`);
			})
			.catch(error => {
				console.log('Something went wrong when fetching the message: ', error);
			});
	} else {
        // Log any incoming messages that arent partial
		console.log(`\n${msg.author.username}:\n${msg.content}`);
	}

    // Check if the message is a command, if not then exit
    if (!msg.content.toLowerCase().startsWith(prefix)) return;


    // Check command exists

    const command = getArgs(msg.content.substring(prefix.length), 2, true);

    command[0] = command[0].toLowerCase();

    if (!isCommand(command[0])) return;


    // Command handling

    // Process the help command first
    if (validateUserCommand(msg.author.id, commands.help, command[0], msg)) {
        // Generate the list that can be displayed when the user sends the help command with no arguments
        var helpContent = `Use "\`${commands.help.help}\`" to get help with one of the commands below:\n`;
        for (var cmd in commands) if (cmd !== 'help') helpContent += `\n\*\*${commands[cmd].command}\*\*\n${commands[cmd].description}\n`;

        // Function to create an embed based on the contents of a command object
        const helpEmbed = cmd => {
            if (cmd === 'help' || isAliasOf(commands.help, cmd)) return quickembed("Help", helpContent, helpColour);
            else if (typeof commands[cmd] === 'undefined') {
                var cmd = getCommand(cmd);
                if (cmd !== "") return quickembed(commands[cmd].name, commands[cmd].help, helpColour);
                return quickembed("Error - Invalid Help Command", helpContent, errorColour);
            }
            return quickembed(commands[cmd].name, commands[cmd].help, helpColour);
        };


        // Send the embed to the channel
        if (command.length === 1) {
            channelEmbed(msg.channel, quickembed("Help", helpContent, helpColour));
        }
        else {
            channelEmbed(msg.channel, helpEmbed(command[1].toLowerCase()));
        }
        return;
    }

    // Process the init command
    else if (validateUserCommand(msg.author.id, commands.init, command[0], msg)) {
        
        // Get existing tables in the database
        var existing = await serverQuery(SQL.checkDatabaseExists);

        if (checkQueryErrors(existing, msg)) return; // Ensure no errors occurred

        // If the database does not already exist then create it
        if (existing.length === 0) {
            console.log(`Database doesn't exist, creating database "\`${dbName}\`"`);
            var sentEmbed = await channelEmbed(msg.channel, quickembed("Creating Database", `The database "\`${dbName}\`" does not already exist so it will now be created.`));

            // Create the database
            if (checkQueryErrors(await serverQuery(SQL.createDatabase))) {
                console.log("Failed to create database");
                editEmbed(sentEmbed, quickembed("Error - Database Creation Failed", `Database creation failed, database "\`${tableName}\`" was not created.`, errorColour));
                return;
            }
            console.log("Database created");

            // Create the table in the database
            console.log(`Creating table "${tableName}"`);
            if (checkQueryErrors(await databaseQuery(SQL.createTable))) {
                console.log("Failed to create table");
                editEmbed(sentEmbed, quickembed("Error - Database Initialisation Failed", `Database initialisation failed, table "\`${tableName}\`" was not created.`, errorColour));
                return;
            }
            console.log("Table created");

            // Update the original message to inform the user of success
            editEmbed(sentEmbed, quickembed("Database Created", `Database initialisation successful, database "\`${dbName}\`" created.`, successColour));
        }

        // Check if the database already exists on the server
        else if (existing.length === 1) {
            // Create buttons for the embed
            buttonOverwrite = {
                id: "overwriteYes",
                label: "OVERWRITE",
                style: "DANGER",
                trigger: async interaction => {
                    await interaction.update({embeds: [quickembed("Initialising Database", `Initialising database "\`${dbName}\`", please wait...`, errorColour)], components: []});

                    // Delete then create the database
                    console.log(`Overwriting database "${dbName}"`);
                    if (checkQueryErrors(await serverQuery(SQL.deleteDatabase, SQL.createDatabase))) {
                        console.log("Failed to overwrite database");
                        editEmbed(interaction.message, quickembed("Error - Database Overwrite Failed", `Database creation failed, database "\`${dbName}\`" was not created.`, errorColour));
                        return;
                    }
                    else console.log("Database overwritten");

                    // Create the table
                    console.log(`Creating table "${tableName}"`);
                    if (checkQueryErrors(await databaseQuery(SQL.createTable))) {
                        console.log("Failed to create table");
                        editEmbed(interaction.message, quickembed("Error - Database Initialisation Failed", `Database initialisation failed, table "\`${tableName}\`" was not created.`, errorColour));
                        return;
                    }
                    else console.log("Table created");

                    editEmbed(interaction.message, quickembed("Database Overwritten", `Database initialisation successful, database "\`${dbName}\`" created.`, successColour));
                }
            }
            buttonCancel = {
                id: "overwriteNo",
                label: "CANCEL",
                style: "SECONDARY",
                trigger: async interaction => {
                    console.log("CANCEL");
                    await interaction.update({embeds: [quickembed("Cancelled", `Initialisation of database "\`${dbName}\`" cancelled.`, cancelColour)], components: []});
                }
            }

            sendButtonEmbed(msg, quickembed("Overwrite Existing Database?", `The database "\`${dbName}\`" already exists, are you sure you want to overwrite it?`, errorColour), true, true, {max: 1}, buttonOverwrite, buttonCancel);
        }

        // A length that is greater than 1 could indicate that there is a corrupt database or some other problem
        // If that is the case inform the user that there is an issue that cannot be fixed automatically
        else if (existing.length > 1) {
            replyEmbed(msg, quickembed("Error - Duplicated / Bugged Database", `It has been detected that multiple databases (${existing.length}) exist under the name "\`${dbName}\`", this is unfixable and requires attention on the server.`, errorColour));
        }

        return;
    }


    // Ensure that both the database and table exist before continuing to the next commands

    // Check that the database exists
    var existing = await serverQuery(SQL.checkDatabaseExists);

    if (checkQueryErrors(existing, msg)) return;

    if (existing.length === 0) {
        replyEmbed(msg, quickembed("Error - Database Doesn't Exist", `The database "\`${dbName}\`" does not exist, use \`${commands.init.usage}\` to set it up.`, errorColour));
        return;
    }
    else if (existing.length > 1) {
        replyEmbed(msg, quickembed("Error - Duplicated / Bugged Database", `It has been detected that multiple databases (${existing.length}) exist under the name "\`${dbName}\`", this is unfixable and requires attention on the server.`, errorColour));
        return;
    }

    // Check that the table exists
    const tables = await databaseQuery(SQL.checkTableExists);

    if (checkQueryErrors(tables, msg)) return;

    // If the table does not already exist create it
    if (tables.length === 0) {
        channelEmbed(msg.channel, quickembed("Warn - Creating New Table", `The necessary table "\`${tableName}\`" does not exist on the database "\`${dbName}\`". Creating new table "\`${tableName}\`".`, warnColour));
        console.log("Table does not exist, creating table.");
        checkQueryErrors(await databaseQuery(SQL.createTable), msg);
    }


    // Handle any commands that directly interact with the database

    // Process the todo command
    if (validateUserCommand(msg.author.id, commands.todo, command[0], msg)) {

        // Get the To-Dos related to the user
        const todoRows = await databaseQuery(SQL.getUserTodos(msg.author.id));

        if (checkQueryErrors(todoRows, msg)) return; // Check for response errors

        // Create a ToDoList with the response
        const todoList = new ToDoList(todoRows);

        // If the user does not specify a ToDo then display the entire list
        if (command.length === 1) {
            channelEmbed(msg.channel, quickembed(`${msg.author.username}#${msg.author.discriminator}'s To-Do List`, `${todoList.getPrintable()}`, todoBasicColour));
        }

        else {
            // If the user specifies a ToDo then use the ToDoList#get method to search for the user's argument
            var todo = todoList.get(command[1]);
            if (typeof todo === 'undefined' || todo === null) {
                replyEmbed(msg, quickembed("Unable to Find To-Do", `No To-Dos on your list match the ID or Title of "\`${command[1]}\`" - please check the value and try again.`, errorColour));
            }
            else {
                // Create a button to toggle whether the ToDo is complete or not
                buttonComplete = {
                    id: "toggleComplete",
                    label: `Click to ${(todo.completed) ? "Uncomplete" : "Complete"}`,
                    style: `${(todo.completed) ? "SECONDARY" : "SUCCESS"}`,
                    trigger: async interaction => {
                        // Get the To-Do
                        const todoRows = await databaseQuery(SQL.getTodo(todo.todoID));

                        // Check that the To-Do was successfully found, if not then edit the original message to display an error
                        if (checkQueryErrors(todoRows)) {
                            console.log("Failed to get To-Do");
                            await interaction.update({embeds: [quickembed("Error - Failed to get To-Do", `Failed to get the To-Do "${todo.title}" (ID: ${todo.todoID}).`, errorColour)], components: []});
                            return;
                        }

                        // Cast the response to a ToDo object
                        todo = new ToDo(todoRows[0]);

                        if (todo.completed) {
                            // If the todo is already completed then edit the message to display that the user can press the button again to complete the To-Do
                            interaction.component.setStyle("SUCCESS");
                            interaction.component.setLabel("Click to Complete");
                            todo.completed = false;

                            // Attempt to uncomplete the To-Do, if it fails then edit the message to display an error
                            if (checkQueryErrors(await databaseQuery(SQL.setTodoCompleted(todo.todoID, false)))) {
                                console.log("Failed to uncomplete To-Do");
                                await interaction.update({embeds: [quickembed("Error - Failed to Uncomplete To-Do", `Failed to uncomplete the To-Do "${todo.title}" (ID: ${todo.todoID}).`, errorColour)], components: []});
                                return;
                            }

                            // Apply updates to the original message
                            await interaction.update({embeds: [quickembed(todo)], components: [new Discord.MessageActionRow().addComponents(interaction.component)]});
                        }
                        else {
                            // If the todo is not already completed then edit the message to display that the user can press the button again to uncomplete the To-Do
                            interaction.component.setStyle("SECONDARY");
                            interaction.component.setLabel("Click to Uncomplete");
                            todo.completed = true;

                            // Attempt to complete the To-Do, if it fails then edit the message to display an error
                            if (checkQueryErrors(await databaseQuery(SQL.setTodoCompleted(todo.todoID, true)))) {
                                console.log("Failed to complete To-Do");
                                await interaction.update({embeds: [quickembed("Error - Failed to Complete To-Do", `Failed to complete the To-Do "${todo.title}" (ID: ${todo.todoID}).`, errorColour)], components: []});
                                return;
                            }

                            // Apply updates to the original message
                            await interaction.update({embeds: [quickembed(todo)], components: [new Discord.MessageActionRow().addComponents(interaction.component)]});
                        }
                    }
                }

                // Send the message with the button attached and a timeout of 30s to avoid a memory leak
                sendButtonEmbed(msg, quickembed(todo), false, true, {
                    timeout: 30_000,
                    removeButtons: true,
                    endFunction: async message => {
                        // When the button times out update the message to reflect the current state of the To-Do (whether it is completed or not)
                        let todoRows = await databaseQuery(SQL.getTodo(todo.todoID));

                        if (checkQueryErrors(todoRows) || todoRows.length !== 1) return; // If there is an error just ignore it as there is no need to warn the users

                        editEmbed(message, quickembed(new ToDo(todoRows[0])));
                    }
                }, buttonComplete);
            }
        }

    }

    // Process the add command
    else if (validateUserCommand(msg.author.id, commands.add, command[0], msg)) {
        // Set up default embeds and lambda functions to create embeds
        const helpEmbed = quickembed("Error - Invalid Command", `Invalid ${command[0]} command, use \`${prefix}${commands.help.command} ${command[0]}\` for help with this command.`, errorColour);
        const exceededLimitEmbed = isTitle => quickembed(`Error - Max ${isTitle ? "Title" : "Description"} Length Exceeded`, `You tried to create a To-Do with a ${isTitle ? "title" : "description"} that was too long - over the limit of ${isTitle ? maxTitleLength : maxDescriptionLength} characters.`, errorColour);
        const successEmbed = todo => quickembed("To-Do Created!", `Created the To-Do below:\n\n${todo.getPrintable()}`, todoCreatedColour);

        // If the command doesnt have any arguments display the invalid command message
        if (command.length !== 2) {
            replyEmbed(msg, helpEmbed);
            return;
        }

        const args = getStringArgs(command[1]);

        // Accept the command "-add Title" without the need for quotes if the user doesn't need a description or a date
        if (args.stringArgs.length === 0) {
            // Ensure that the title is not blank
            if (args.extraArgs === "") {
                replyEmbed(msg, helpEmbed);
                return;
            }
            
            if (args.extraArgs.length > maxTitleLength) {
                replyEmbed(msg, exceededLimitEmbed(true));
                return;
            }

            var todo = new ToDo(0, args.extraArgs, "", null, false, msg.author.id);
            var response = await databaseQuery(SQL.addTodo(todo));
            if (checkQueryErrors(response, msg)) return;

            channelEmbed(msg.channel, successEmbed(todo));
        }

        // Otherwise ensure that there are only 1 or 2 string values, for title and optionally description
        else if (args.stringArgs.length <= 2) {
            // If a description exists store it, otherwise default to an empty string
            const description = (args.stringArgs.length === 2) ? args.stringArgs[1] : "";
            var response;

            // Check that both the title and the description don't exceed their character limits
            if (args.stringArgs[0].length > maxTitleLength) {
                replyEmbed(msg, exceededLimitEmbed(true));
                return;
            }
            if (description.length > maxDescriptionLength) {
                replyEmbed(msg, exceededLimitEmbed(false));
                return;
            }

            // Ensure that the title is not empty
            if (args.stringArgs[0].length === 0) {
                replyEmbed(msg, helpEmbed);
                return;
            }

            // If the user hasn't defined a time create the To-Do without one
            else if (args.extraArgs === "") {
                var todo = new ToDo(0, args.stringArgs[0], description, null, false, msg.author.id);
                response = await databaseQuery(SQL.addTodo(todo));
                if (checkQueryErrors(response, msg)) return;
                channelEmbed(msg.channel, successEmbed(todo));
            }
            // Otherwise there is a time specified
            else {
                var todo = new ToDo(0, args.stringArgs[0], description, formatTime(args.extraArgs), false, msg.author.id);
                response = await databaseQuery(SQL.addTodo(todo));
                if (checkQueryErrors(response)) {
                    // Display an error message if the date was invalid, otherwise check for other error messages
                    if (response.code === "ER_TRUNCATED_WRONG_VALUE") replyEmbed(msg, quickembed("Error - Invalid Date", `The date "\`${args.extraArgs}\`" is invalid, use \`${prefix}${commands.help.command} ${command[0]}\` for help with this command.`, errorColour));
                    else checkQueryErrors(response, msg);
                    return;
                }
                channelEmbed(msg.channel, successEmbed(todo));
            }
        }

        else {
            replyEmbed(msg, helpEmbed);
        }
    }

    // Process the remove command
    else if (validateUserCommand(msg.author.id, commands.remove, command[0], msg)) {
        // If there are no arguments ask for confirmation before removing all To-Dos
        if (command.length === 1) {
            buttonRemoveAll = {
                id: "removeAllYes",
                label: "REMOVE ALL",
                style: "DANGER",
                trigger: async interaction => {
                    // Update original message to show progress towards removing
                    await interaction.update({embeds: [quickembed("Removing All To-Dos", `Deleting all of your To-Dos, please wait...`, errorColour)], components: []});
    
                    // If there was an error update the message to display a generic error message
                    if (checkQueryErrors(await databaseQuery(SQL.removeUserTodos(msg.author.id)))) {
                        console.log("Failed to remove To-Dos");
                        editEmbed(interaction.message, quickembed("Error - Failed to Remove To-Dos", `Some To-Dos were not deleted.`, errorColour));
                        return;
                    }
    
                    // Update the message to confirm that the To-Dos were removed
                    editEmbed(interaction.message, quickembed(`Removed All To-Dos`, `All of your To-Dos have been deleted.`, todoRemovedColour));
                }
            }
            buttonCancelAll = {
                id: "removeAllNo",
                label: "CANCEL",
                style: "SECONDARY",
                trigger: async interaction => {
                    // Update the original message to show that the To-Dos were not removed
                    await interaction.update({embeds: [quickembed("Cancelled", `Your To-Dos were not deleted.`, cancelColour)], components: []});
                }
            }
    
            // Send a message requesting confirmation for removing all To-Dos with the buttons attached
            sendButtonEmbed(msg, quickembed(`Remove All To-Dos?`, `Are you sure you want to remove all of your To-Dos? This includes your completed and uncompleted To-Dos.`, errorColour), true, true, {max: 1}, buttonRemoveAll, buttonCancelAll);
            return;
        }

        // If a To-Do was specified then load the user's To-Do list
        const todoRows = await databaseQuery(SQL.getUserTodos(msg.author.id));
        if (checkQueryErrors(todoRows, msg)) return;
        const todoList = new ToDoList(todoRows);

        // Search the To-Do list for the specified To-Do
        var todo = todoList.get(command[1]);

        if (todo === null || typeof todo === 'undefined') {
            // If the To-Do was not found inform the user of an error
            replyEmbed(msg, quickembed("Unable to Find To-Do", `No To-Dos on your list match the ID or Title of "\`${command[1]}\`" - please check the value and try again.`, errorColour));
        }

        else {
            buttonRemove = {
                id: "removeYes",
                label: "REMOVE",
                style: "DANGER",
                trigger: async interaction => {
                    // Update original message to show progress towards removing
                    await interaction.update({embeds: [quickembed("Removing To-Do", `Removing To-Do "${todo.title}", please wait...`, errorColour)], components: []});

                    // If there was an error update the message to show that the To-Do was not removed
                    if (checkQueryErrors(await databaseQuery(SQL.removeTodo(todo.todoID)))) {
                        console.log("Failed to remove To-Do");
                        editEmbed(interaction.message, quickembed("Error - Failed to Remove To-Do", `"${todo.title}" was not deleted.`, errorColour));
                        return;
                    }

                    // Update the message to confirm that the To-Do was removed
                    editEmbed(interaction.message, quickembed(`Removed "${todo.title}"`, `The To-Do below (ID: ${todo.todoID}) was removed.\n\n${todo.getPrintable()}`, todoRemovedColour));
                }
            }
            buttonCancel = {
                id: "removeNo",
                label: "CANCEL",
                style: "SECONDARY",
                trigger: async interaction => {
                    // Update the original message to show that the To-Do was not removed
                    await interaction.update({embeds: [quickembed("Cancelled", `"${todo.title}" was not removed.`, cancelColour)], components: []});
                }
            }

            // Send a message to confirm that the To-Do should be deleted, display the To-Do so that the user is aware of what they are deleting
            sendButtonEmbed(msg, quickembed(`Remove "${todo.title}"?`, `Are you sure you want to remove the To-Do below? (ID: ${todo.todoID})\n\n${todo.getPrintable()}`, errorColour), true, true, {max: 1}, buttonRemove, buttonCancel);
        }
    }

    // Process the complete or uncomplete commands
    else if (validateUserCommand(msg.author.id, commands.complete, command[0], msg) || validateUserCommand(msg.author.id, commands.uncomplete, command[0], msg)) {
        // Check if the command is for completing or uncompleting the To-Do/s
        const completing = (isCommandFor(commands.complete, command[0]) || isAliasOf(commands.complete, command[0])) ? true : false;

        // Check if the user wants to un/complete all of the To-Dos on their list
        if (command.length === 1) {
            buttonCompleteAll = {
                id: "toggleCompleteAll",
                label: `${(completing) ? "C" : "Unc"}omplete All`,
                style: "PRIMARY",
                trigger: async interaction => {
                    // Update the original message to inform the user of progress
                    await interaction.update({embeds: [quickembed(`${(completing) ? "C" : "Unc"}ompleting All To-Dos`, `${(completing) ? "C" : "Unc"}ompleting all of your To-Dos, please wait...`, errorColour)], components: []});
    
                    // If there is an error update the message to display a generic error message
                    if (checkQueryErrors(await databaseQuery(SQL.setAllCompleted(msg.author.id, completing)))) {
                        console.log("Failed to toggle To-Dos");
                        editEmbed(interaction.message, quickembed(`Error - Failed to ${(completing) ? "C" : "Unc"}omplete To-Dos`, `Some To-Dos were not ${(completing) ? "" : "un"}completed.`, errorColour));
                        return;
                    }
    
                    // Update the message to confirm that the To-Dos have been un/completed
                    editEmbed(interaction.message, quickembed(`${(completing) ? "C" : "Unc"}ompleted All To-Dos`, `All of your To-Dos have been ${(completing) ? "" : "un"}completed.`, (completing) ? todoCompleteColour : todoUncompleteColour));
                }
            }
            buttonCancelCompleteAll = {
                id: "cancelCompleteAll",
                label: "Cancel",
                style: "SECONDARY",
                trigger: async interaction => {
                    // Confirm that the action has been cancelled
                    await interaction.update({embeds: [quickembed("Cancelled", `Your To-Dos were not ${(completing) ? "" : "un"}completed.`, cancelColour)], components: []});
                }
            }
    
            // Send a message to confirm that all of the To-Dos should be un/completed
            sendButtonEmbed(msg, quickembed(`${(completing) ? "C" : "Unc"}omplete All To-Dos?`, `Are you sure you want to ${(completing) ? "" : "un"}complete all of your To-Dos?`, errorColour), false, true, {max: 1}, buttonCompleteAll, buttonCancelCompleteAll);
            return;
        }

        // If the user is wanting to un/complete a specific To-Do load their To-Do list
        const todoRows = await databaseQuery(SQL.getUserTodos(msg.author.id));
        if (checkQueryErrors(todoRows, msg)) return;
        const todoList = new ToDoList(todoRows);

        // Get the To-Do that they specified and toggle it's completion state
        var todo = todoList.get(command[1]);
        if (todo === null) {
            // If the To-Do was not found inform the user of an error
            replyEmbed(msg, quickembed("Unable to Find To-Do", `No To-Dos on your list match the ID or Title of "\`${command[1]}\`" - please check the value and try again.`, errorColour));
        }
        else {
            const queryResult = await databaseQuery(SQL.setTodoCompleted(todo.todoID, completing));
            if (checkQueryErrors(queryResult, msg)) return;

            // Display a message to confirm that the To-Do has been un/completed
            channelEmbed(msg.channel, quickembed(`"${todo.title}" - ${(completing) ? "Completed" : "Uncompleted"}`, `The To-Do "${todo.title}" (ID: ${todo.todoID}) has been ${(completing) ? "" : "un"}completed.`, (completing) ? todoCompleteColour : todoUncompleteColour));
        }
    }
});


// Login with to the client
client.login(token);
