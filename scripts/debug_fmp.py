import requests

# Your Key
API_KEY = "XJ43qBGd4VLdTWhWJD7rIlvnWYRyGbGL"
TICKER = "AAPL"
BASE_URL = "https://financialmodelingprep.com/api/v3"

def test_connection():
    print(f"🕵️ Testing connection for {TICKER}...")
    
    # 1. Test Income Statement Endpoint
    url = f"{BASE_URL}/income-statement/{TICKER}?period=quarter&limit=1&apikey={API_KEY}"
    print(f"👉 Requesting: {url}")
    
    response = requests.get(url)
    
    print(f"📩 Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if not data:
            print("❌ Error: API returned 200 OK, but the list is empty ( [] ).")
        else:
            print("✅ Success! Data received.")
            print(f"   Revenue: {data[0].get('revenue', 'N/A')}")
    else:
        print(f"❌ API Error: {response.text}")

if __name__ == "__main__":
    test_connection()
