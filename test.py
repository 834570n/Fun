#!/usr/bin/env python3
def main():
    while True:
        word = ""
        print("[+] Assassins Testing Program")
        print("[0] Append test")
        print("[1] Read test")
        print("[2] Exit")
        word = input("[>] ")
        if(word == "0"):
            print("[-] Conducting append test")
            appendTest()
        elif(word == "1"):
            print("[-] Conducting read test")
            readTest()
        elif(word == "2"):
            print("[-] Exiting")
            break
        else:
            print("[-] Not a valid response")


def appendTest():
    file = open('data.dat', 'a')
    file.write("(\"test\", \"test@test.test\")\n")
    file.close()

def readTest():
    li = []
    file = open('data.dat', 'r')
    #for num, line in enumerate(file):
        #print("Line {}: {}".format(num, line))
    line = file.readline()
    while line:
        li.append(eval(line.strip('\n')))
        line = file.readline()
    for i in li:
        print(i[0])

if(__name__ == "__main__"):
    main()
