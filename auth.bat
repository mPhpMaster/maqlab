@echo off
REM Opens the Discord install page already set to SERVER install.
REM integration_type=0 means guild install; installing to a personal account
REM instead is what triggers "activities require verification in servers with
REM more than 25 members".
start "" "https://discord.com/oauth2/authorize?client_id=1551001414598262887&scope=applications.commands&integration_type=0"
