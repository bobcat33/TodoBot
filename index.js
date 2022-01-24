// Imports
const Discord = require("discord.js");
const MySQL = require('mysql');
const util = require('util');

// Config
const client = new Discord.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"], partials: ['CHANNEL'] });

const { prefix,
    dbHost, dbUser, dbPass, dbName, tableName,
    errorColour, warnColour, cancelColour, successColour, helpColour,
    maxTitleLength, maxDescriptionLength,
    token } = require("./config.json");

const commands = {
    help: {
        name: "Help Command",
        command: "help",
        description: "Get help with commands.",
        usage: `${prefix}help`,
        help: `${prefix}help <command>`,
        aliases: []
    },
    init: {
        name: "Setup Command",
        command: "init",
        description: "Set up the To-Do list database.",
        usage: `${prefix}init`,
        help: `\`${prefix}init\`: Set up the todo list database.`,
        aliases: ["setup"]
    },
    todo: {
        // TODO - Implement
        name: "Todo Command",
        command: "todo",
        description: "List all To-Dos or specify one to view.",
        usage: ``,
        help: ``,
        aliases: ["list"]
    },
    add: {
        name: "Add Item Command",
        command: "add",
        description: "Add an item to your To-Do list",
        usage: `${prefix}add <to-do>`,
        help: `In the below commands the value for \`date\` must be either of the format "\`YYYY-MM-DD\`" or "\`YYYY-MM-DD HH:MM:SS\`"\n\n\*\*Commands:\*\*\n\`${prefix}add <title>\`: Add an item to your To-Do list with just a title.\n\`${prefix}add "<title>" <date>\`: Add an item to your To-Do list with both a title and a date (optional).\n\`${prefix}add "<title>" "<description>" <date>\`: Add an item to your To-Do list with a title, a description and a date (optional).`,
        aliases: ["create"]
    },
    remove: {
        // TODO - Implement
        name: "Remove Item Command",
        command: "remove",
        description: "Remove an item from your To-Do list",
        usage: `${prefix}remove`,
        help: `\`${prefix}remove\`: Remove an item from your To-Do list.`,
        aliases: ["delete"]
    }
}

const SQL = {
    checkDatabaseExists: `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${dbName}';`,
    deleteDatabase: `DROP DATABASE IF EXISTS ${dbName};`,
    createDatabase: `CREATE DATABASE IF NOT EXISTS ${dbName};`,
    checkTableExists: `SHOW TABLES LIKE '${tableName}';`,
    createTable: `CREATE TABLE IF NOT EXISTS ${tableName} (id INT NOT NULL AUTO_INCREMENT UNIQUE KEY PRIMARY KEY, userID varchar(20) NOT NULL, title varchar(${maxTitleLength}) NOT NULL, description varchar(${maxDescriptionLength}) NOT NULL, completeDate datetime, createDate datetime NOT NULL, completed bool NOT NULL);`,
    getUserTodo: userID => `SELECT * FROM ${tableName} WHERE userID = '${userID}';`,
    addTodo: (userID, title, description, completeDate) => {
        let usingCompleteDate = !(typeof completeDate === 'undefined');
        let fields = `userID, title, description, ${(usingCompleteDate) ? "completeDate, " : ""}createDate, completed`;
        let values = `'${userID}', '${title.substring(0, maxTitleLength)}', '${description.substring(0, maxDescriptionLength)}', ${(usingCompleteDate) ? `'${completeDate}', ` : ""}CURRENT_TIMESTAMP(), FALSE`;
        return `INSERT INTO ${tableName} (${fields}) VALUES (${values})`;
    }
}



// General Functions

// Parse the arguments from a command
function getArgs(string, numargs, includeCommand) {
	includeCommand = (typeof includeCommand === 'undefined') ? false : includeCommand;
	numargs = (numargs <= 0) ? numargs : numargs-1;

	var baseargs = string.split(" ");
	if (!includeCommand)
		baseargs.splice(0, 1);

	var args = [];
	for (i=0;i<numargs;i++) {
		if (i === baseargs.length)
			return args;

		args.push(baseargs[i]);

	}

	var finalargs = baseargs.splice(numargs);
	if (finalargs.length !== 0)
		args.push(finalargs.join(" "));

	return args;
}

// Parse the string for arguments wrapped by "", if includeNonString is true anything left over after removing the string arguments will be included in the return value.
function getStringArgs(string, includeNonString) {
	includeNonString = (typeof includeNonString === 'undefined') ? true : includeNonString;

    var startIndex = -2;
    var endIndex = -1;
    var args = [];
    var nonString = string;
    var nonStringIndexModifier = 0;

    for (var i=0;i < string.length;i++) {
        // Skip over escaped " characters
        if (string.charAt(i) === "\\" && string.charAt(i + 1) === '"') {
            i++;
        } else if (string.charAt(i) === '"') {
            if (startIndex < endIndex)
                startIndex = i;
            else {
                endIndex = i;
                args.push(string.substring(startIndex + 1, endIndex).replaceAll('\\"', '"'));
                if (includeNonString) {
                    nonString = nonString.substring(0, startIndex - nonStringIndexModifier) + nonString.substring(endIndex + 1 - nonStringIndexModifier);
                    nonStringIndexModifier += endIndex + 1 - startIndex;
                }
            }
        }
    }

    if (includeNonString) {
        var response = {
            stringArgs: args,
            extraArgs: nonString.replaceAll('\\"', '"').trim()
        };
        return response;
    }
    
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

function getCommand(alias) {
    for (const possibleCommand in commands) {
        if (isAliasOf(commands[possibleCommand], alias)) return possibleCommand;
    }
    return "";
}

// Check if "commandName" is the command for "command"
function isCommandFor(command, commandName) { return (command.command === commandName); }

// Check if "aliasName" is an alias of "command", command must be one of "commands"
function isAliasOf(command, aliasName) { return command.aliases.includes(aliasName); }

// Function to quickly generate an embed
function quickembed(header, content, colour) {
	var colour = (typeof colour !== 'undefined') ? colour : "#34495E";
	var embed = new Discord.MessageEmbed()
		.setColor(colour)
		.setTitle(header)
		.setDescription(content);
	return embed;
}

// Update the embed on a message to a new embed
function editEmbed(message, newEmbed) { message.edit({embeds: [newEmbed]}); }

// Functions to send embeds to channels or reply to messages
function channelEmbed(channel, embed) { return channel.send({embeds : [embed]}); }
function replyEmbed(message, embed) { return message.reply({embeds : [embed]}); }

// Function to apply buttons to an embed and send it
// - Set reply to true to reply to the message (otherwise will send message in the message's channel)
// - Set allowOnlySender to true to only accept button presses from the sender of the message
// - Buttons should be in the form {id, label, style, async trigger(interaction)}
// - Button styles can be one of the following: PRIMARY | SECONDARY | SUCCESS | DANGER | LINK
async function sendButtonEmbed(message, embed, reply, allowOnlySender, ...buttons) {

    if (buttons.length === 0) {
        (reply) ? replyEmbed(message, embed) : channelEmbed(message.channel, embed);
        return;
    }

    const buttonRow = new Discord.MessageActionRow();

    for (const button of buttons) {
        buttonRow.addComponents(new Discord.MessageButton()
            .setCustomId(button.id)
            .setLabel(button.label)
            .setStyle(button.style));
    }

    const filter = i => (i.componentType === 'BUTTON' && (!allowOnlySender || message.author.id === i.user.id));

    const sentMessage = (reply) ? await message.reply({ embeds: [embed], components: [buttonRow] }) : await message.channel.send({ embeds: [embed], components: [buttonRow] });

    const collector = sentMessage.createMessageComponentCollector({filter, max: 1});

    collector.on('collect', async interaction => {
        if (interaction.componentType !== 'BUTTON') return;

        for (const button of buttons) {
            if (button.id === interaction.customId) {
                await button.trigger(interaction);
                return;
            }
        }
    });
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

// Create a connection to server to perform one or more queries.
async function serverQuery(singleQuery, ...extraQueries) {
    console.log("Creating connection to (server) database...");

    const connection = MySQL.createConnection({
        host: dbHost,
        user: dbUser,
        password: dbPass
    });

    return await queryConnection(connection, singleQuery, extraQueries);
    
}

// Create a connection to server to perform one or more queries.
async function databaseQuery(singleQuery, ...extraQueries) {
    console.log(`Creating connection to "${dbName}" database...`);

    const connection = MySQL.createConnection({
        host: dbHost,
        user: dbUser,
        password: dbPass,
        database: dbName
    });

    return await queryConnection(connection, singleQuery, extraQueries);
}

// Check for errors,
function checkQueryErrors(queryResponses, message) {
    const reply = (typeof message === 'undefined') ? false : true;

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
    if (msg.author.bot) return;

    if (msg.partial) {
		msg.fetch()
			.then(fullMessage => {
				console.log(`\nINCOMING PARTIAL MESSAGE\n${fullMessage.author.username}:\n${fullMessage.content}`);
			})
			.catch(error => {
				console.log('Something went wrong when fetching the message: ', error);
			});
	} else {
		console.log(`\n${msg.author.username}:\n${msg.content}`);
	}

    if (!msg.content.toLowerCase().startsWith(prefix)) return;


    // Check command exists

    const command = getArgs(msg.content.substring(prefix.length), 2, true);

    command[0] = command[0].toLowerCase();


    if (!isCommand(command[0])) return;


    // Command handling

    // Process the help command first
    if (isCommandFor(commands.help, command[0]) || isAliasOf(commands.help, command[0])) {
        var helpContent = `Use "\`${commands.help.help}\`" to get help with one of the commands below:\n`;
        for (var cmd in commands) if (cmd !== 'help') helpContent += `\n\*\*${commands[cmd].command}\*\*\n${commands[cmd].description}\n`;

        const helpEmbed = cmd => {
            if (cmd === 'help' || isAliasOf(commands.help, cmd)) return quickembed("Help", helpContent, helpColour);
            else if (typeof commands[cmd] === 'undefined') {
                var cmd = getCommand(cmd);
                if (cmd !== "") return quickembed(commands[cmd].name, commands[cmd].help, helpColour);
                return quickembed("Error - Invalid Help Command", helpContent, errorColour);
            }
            return quickembed(commands[cmd].name, commands[cmd].help, helpColour);
        };


        if (command.length === 1) {
            channelEmbed(msg.channel, quickembed("Help", helpContent, helpColour));
        }
        else {
            channelEmbed(msg.channel, helpEmbed(command[1].toLowerCase()));
        }
        return;
    }

    // Process the init command
    else if (isCommandFor(commands.init, command[0]) || isAliasOf(commands.init, command[0])) {
        
        var existing = await serverQuery(SQL.checkDatabaseExists);

        if (checkQueryErrors(existing, msg)) return;

        if (existing.length === 0) {
            console.log(`Database doesn't exist, creating database "\`${dbName}\`"`);
            var sentEmbed = await channelEmbed(msg.channel, quickembed("Creating Database", `The database "\`${dbName}\`" does not already exist so it will now be created.`));

            if (checkQueryErrors(await serverQuery(SQL.createDatabase))) {
                console.log("Failed to create database");
                editEmbed(sentEmbed, quickembed("Error - Database Creation Failed", `Database creation failed, database "\`${tableName}\`" was not created.`, errorColour));
                return;
            }
            console.log("Database created");

            console.log(`Creating table "${tableName}"`);
            if (checkQueryErrors(await databaseQuery(SQL.createTable))) {
                console.log("Failed to create table");
                editEmbed(sentEmbed, quickembed("Error - Database Initialisation Failed", `Database initialisation failed, table "\`${tableName}\`" was not created.`, errorColour));
                return;
            }
            console.log("Table created");

            editEmbed(sentEmbed, quickembed("Database Created", `Database initialisation successful, database "\`${dbName}\`" created.`, successColour));
        }

        else if (existing.length === 1) {
            buttonOverwrite = {
                id: "overwriteYes",
                label: "OVERWRITE",
                style: "DANGER",
                trigger: async interaction => {
                    await interaction.update({embeds: [quickembed("Initialising Database", `Initialising database "\`${dbName}\`", please wait...`, errorColour)], components: []});

                    console.log(`Overwriting database "${dbName}"`);
                    if (checkQueryErrors(await serverQuery(SQL.deleteDatabase, SQL.createDatabase))) {
                        console.log("Failed to overwrite database");
                        editEmbed(interaction.message, quickembed("Error - Database Overwrite Failed", `Database creation failed, database "\`${dbName}\`" was not created.`, errorColour));
                        return;
                    }
                    else console.log("Database overwritten");

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

            sendButtonEmbed(msg, quickembed("Overwrite Existing Database?", `The database "\`${dbName}\`" already exists, are you sure you want to overwrite it?`, errorColour), true, true, buttonOverwrite, buttonCancel);
        }

        else if (existing.length > 1 || existing.length < 0) {
            replyEmbed(msg, quickembed("Error - Duplicated / Bugged Database", `It has been detected that multiple databases (${existing.length}) exist under the name "\`${dbName}\`", this is unfixable and requires attention on the server.`, errorColour));
        }

        return;
    }


    // Check that the database and table both exist before continuing to the next commands

    var existing = await serverQuery(SQL.checkDatabaseExists);

    if (checkQueryErrors(existing, msg)) return;

    if (existing.length === 0) {
        replyEmbed(msg, quickembed("Error - Database Doesn't Exist", `The database "\`${dbName}\`" does not exist, use \`${commands.init.usage}\` to set it up.`, errorColour));
        return;
    }
    else if (existing.length > 1 || existing.length < 0) {
        replyEmbed(msg, quickembed("Error - Duplicated / Bugged Database", `It has been detected that multiple databases (${existing.length}) exist under the name "\`${dbName}\`", this is unfixable and requires attention on the server.`, errorColour));
        return;
    }

    const tables = await databaseQuery(SQL.checkTableExists);

    if (checkQueryErrors(tables, msg)) return;

    // If the table does not already exist create it
    if (tables.length === 0) {
        channelEmbed(msg.channel, quickembed("Warn - Creating New Table", `The necessary table "\`${tableName}\`" does not exist on the database "\`${dbName}\`". Creating new table "\`${tableName}\`".`, warnColour));
        console.log("Table does not exist, creating table.");
        checkQueryErrors(await databaseQuery(SQL.createTable), msg);
    }

    if (isCommandFor(commands.todo, command[0]) || isAliasOf(commands.todo, command[0])) {

        console.log("todo command");

        const todoList = await databaseQuery(SQL.getUserTodo(msg.author.id));

        if (checkQueryErrors(todoList, msg)) return;

        console.log(todoList);

    }
    else if (isCommandFor(commands.add, command[0]) || isAliasOf(commands.add, command[0])) {
        const helpEmbed = quickembed("Error - Invalid Command", `Invalid ${command[0]} command, use \`${prefix}${commands.help.command} ${command[0]}\` for help with this command.`, errorColour);
        // TODO - format time to epoch and include as "Complete by <t:EPOCH_TIME> (<t:EPOCH_TIME:R>)" using new Date(time).getTime() to get epoch
        const successEmbed = (title, description, time) => quickembed("To-Do Created!", `Created the To-Do below:\n\n\*\*${title}\*\*${(typeof description === 'undefined' || description === "") ? "" : `\n${description}`}${(typeof time === 'undefined') ? "" : `\n\nComplete by ${time}`}`, successColour);

        if (command.length != 2) {
            replyEmbed(msg, helpEmbed);
        }

        const args = getStringArgs(command[1]);

        // Accept the command "-add Title" without the need for quotes if the user doesn't need a description or a date
        if (args.stringArgs.length === 0) {
            if (args.extraArgs === "") {
                replyEmbed(msg, helpEmbed);
                return;
            }
            var response = await databaseQuery(SQL.addTodo(msg.author.id, args.extraArgs, ""));
            if (checkQueryErrors(response, msg)) return;

            channelEmbed(msg.channel, successEmbed(args.extraArgs));
        }

        else if (args.stringArgs.length <= 2) {
            const description = (args.stringArgs.length === 2) ? args.stringArgs[1] : "";
            var response;
            if (args.extraArgs === "") {
                response = await databaseQuery(SQL.addTodo(msg.author.id, args.stringArgs[0], description));
                if (checkQueryErrors(response, msg)) return;
                channelEmbed(msg.channel, successEmbed(args.stringArgs[0], description));
            } else {
                // TODO - Format time + time handling (if person enters hh:mm:ss only then it takes it as a date without providing errors, need to pretent this)
                response = await databaseQuery(SQL.addTodo(msg.author.id, args.stringArgs[0], description, args.extraArgs));
                if (checkQueryErrors(response)) {
                    if (response.code === "ER_TRUNCATED_WRONG_VALUE") replyEmbed(msg, quickembed("Error - Invalid Date", `The date "\`${args.extraArgs}\`" is invalid, date must be of the form "\`YYYY-MM-DD HH:MM:SS\`"`, errorColour));
                    else checkQueryErrors(response, msg);
                    return;
                }
                channelEmbed(msg.channel, successEmbed(args.stringArgs[0], description, args.extraArgs));
            }
        }

        else {
            replyEmbed(msg, helpEmbed);
        }
    }

});


// Login with the client
client.login(token);
