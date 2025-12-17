import http.server
import ssl
import os
import subprocess
import sys
import ipaddress
import datetime

def generate_cert():
    """Generate self-signed certificate using Python"""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        # Generate key
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )

        # Generate certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "CA"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "Local"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "FaceSwap"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ])
        
        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.utcnow()
        ).not_valid_after(
            datetime.datetime.utcnow() + datetime.timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        ).sign(key, hashes.SHA256(), default_backend())

        # Write files
        with open("key.pem", "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        with open("cert.pem", "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        
        return True
    except ImportError:
        print("Installing cryptography...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography", "-q"])
        return False

# Generate certificate if needed
if not os.path.exists('cert.pem') or not os.path.exists('key.pem'):
    print("Generating self-signed SSL certificate...")
    if not generate_cert():
        # Retry after install
        generate_cert()
    print("Certificate generated!")

# Create HTTPS server
server_address = ('', 8000)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Wrap with SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain('cert.pem', 'key.pem')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print("\n" + "=" * 60)
print("PURE JS FACE SWAP - HTTPS SERVER")
print("=" * 60)
print("\nOpen: https://localhost:8000")
print("WARNING: Accept the self-signed certificate warning in your browser")
print("   (Click 'Advanced' -> 'Proceed to localhost')")
print("\nPress Ctrl+C to stop the server\n")

httpd.serve_forever()
