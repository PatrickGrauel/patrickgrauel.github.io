import requests

API_KEY = "XJ43qBGd4VLdTWhWJD7rIlvnWYRyGbGL"
TICKER = "AAPL"
BASE_URL = "https://financialmodelingprep.com/api/v3"

def test_annual():
    print(f"🕵️ Testing ANNUAL connection for {TICKER}...")
    
    # REMOVED: period=quarter
    url = f"{BASE_URL}/income-statement/{TICKER}?limit=1&apikey={API_KEY}"
    print(f"👉 Requesting: {url}")
    
    response = requests.get(url)
    
    if response.status_code == 200:
        print("✅ SUCCESS! Annual data is available.")
        print(f"   Revenue: {response.json()[0].get('revenue')}")
    else:
        print(f"❌ FAILED: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    test_annual()
