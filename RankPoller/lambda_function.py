import json
import requests

def lambda_handler(event, context):
    url = "https://pokemonshowdown.com/users/thebrucey.json"
    
    # Fetch the JSON data
    response = requests.get(url)
    
    # Parse the JSON data
    data = response.json()
    
    # Access and print the 'body' field
    # If 'body' is a string that needs to be parsed
    body = data.get('body')
    print(data)
    
    return {
        'statusCode': 200,
        'body': response
    }
    
    return {
        'statusCode': 500,
        'body': json.dumps({"error": "Failed to retrieve data"})
    }

if __name__ == '__main__':
    lambda_handler("","")