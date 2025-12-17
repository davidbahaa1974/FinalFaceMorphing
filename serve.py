from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='.', static_url_path='')

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("PURE JS FACE SWAP SERVER")
    print("=" * 60)
    print("\nOpen: https://localhost:8000")
    # Using adhoc SSL like the main app for camera access
    app.run(host='0.0.0.0', port=8000, ssl_context='adhoc')
