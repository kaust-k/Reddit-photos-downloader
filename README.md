$ DEBUG=* USERNAME='username'  PASSWORD='password' CLIENTID='clientid' CLIENTSECRET='clientsecret' IGNORE_DB=false TOP_TIME=month GET_TOP=1 node main.js

IGNORE_DB: set to true, if you don't want to save downloaded posts to db (they will be re-downloaded next time you fetch posts)

TOP_TIME: week / month / year

GET_TOP: if not set, "hot" posts will be fetched instead of "top" posts


