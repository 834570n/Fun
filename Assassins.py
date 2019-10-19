#!/usr/bin/env python3
#Assassins autonomous controller
#TODO save list of brothers and email addresses to a data file
#TODO input that data file
#TODO add brothers and email addresses to the list
#TODO email brothers who their target is
#TODO remove name from list when they have been killed
#TODO save list of randomized brothers during a game

import random

def main():
    bros = []
    brosRand = []
    word = ""

    '''
    while (True):
        word = input("Enter name of brother: ")
        if (word.upper() == "STOP"):
            break
        bros.append(word)
    '''

    #input list of bros
    #present main menu
        # [+] ASSASSIN'S AUTONOMOUS CONTROLLER
        # [-] Add Brother to game


def randomizeBros(bros):
    broLen = len(bros)
    randList = []

    for i in range(0, broLen):
        x = bros.pop(broLen-i-1)
        y = random.randint(0, len(randList))
        randList.insert(y, x)
