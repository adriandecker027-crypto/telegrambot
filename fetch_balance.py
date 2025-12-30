from camoufox.sync_api import Camoufox
from browserforge.fingerprints import Screen
import sys

def get_balance_finance(address):
    with Camoufox(os=["windows", "macos", "linux"],locale=["en-US", "fr-FR", "de-DE"], screen=Screen(max_width=1920, max_height=1080)) as browser:
        page = browser.new_page()
        page.goto("https://debank.com/profile/"+address)
        page.wait_for_timeout(10000)
        res = page.evaluate("document.querySelector('.HeaderInfo_totalAssetInner__HyrdC.HeaderInfo_curveEnable__HVRYq').innerText")
        page.close()
        return (res)
    
if __name__ == '__main__':

    worth =  get_balance_finance(sys.argv[1])
                
    print(worth.split('\n')[0])
    sys.stdout.flush()