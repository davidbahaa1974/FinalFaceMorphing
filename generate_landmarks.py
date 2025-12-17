"""
Landmark Generator for Face Morph Pro
Generates facial landmarks for images using MediaPipe Face Mesh
"""

import json
import os
import cv2
import mediapipe as mp
import glob

# Initialize MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh

def extract_landmarks(image_path):
    """Extract facial landmarks from an image using MediaPipe."""
    image = cv2.imread(image_path)
    if image is None:
        print(f"  [ERROR] Could not load image: {image_path}")
        return None
    
    # Convert BGR to RGB
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    height, width = image.shape[:2]
    
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    ) as face_mesh:
        results = face_mesh.process(image_rgb)
        
        if not results.multi_face_landmarks:
            print(f"  [WARNING] No face detected in: {image_path}")
            return None
        
        # Extract landmarks as [x, y] pairs in pixel coordinates
        landmarks = []
        for landmark in results.multi_face_landmarks[0].landmark:
            x = landmark.x * width
            y = landmark.y * height
            landmarks.append([x, y])
        
        return landmarks

def process_category(category_path, landmarks_path):
    """Process all images in a category folder."""
    os.makedirs(landmarks_path, exist_ok=True)
    
    # Get all image files
    extensions = ['*.png', '*.jpg', '*.jpeg', '*.PNG', '*.JPG', '*.JPEG']
    images = []
    for ext in extensions:
        images.extend(glob.glob(os.path.join(category_path, ext)))
    
    if not images:
        print(f"  No images found in: {category_path}")
        return
    
    for image_path in images:
        filename = os.path.basename(image_path)
        name_without_ext = os.path.splitext(filename)[0]
        landmarks_file = os.path.join(landmarks_path, f"{name_without_ext}.json")
        
        # Skip if landmarks already exist
        if os.path.exists(landmarks_file):
            print(f"  [SKIP] Already exists: {landmarks_file}")
            continue
        
        print(f"  Processing: {filename}")
        landmarks = extract_landmarks(image_path)
        
        if landmarks:
            with open(landmarks_file, 'w') as f:
                json.dump(landmarks, f)
            print(f"    -> Saved {len(landmarks)} landmarks to {name_without_ext}.json")
        else:
            print(f"    -> Failed to extract landmarks")

def main():
    base_path = os.path.dirname(os.path.abspath(__file__))
    morph_images_path = os.path.join(base_path, "morph_images")
    
    # Define categories to process
    categories = [
        ("animals", "animals"),
        ("celebrities", "celebrities"),
        ("historical", "historical"),
        ("races", "races")
    ]
    
    print("=" * 50)
    print("Face Morph Pro - Landmark Generator")
    print("=" * 50)
    
    for category_folder, landmarks_folder in categories:
        print(f"\n[{category_folder.upper()}]")
        category_path = os.path.join(morph_images_path, category_folder)
        landmarks_path = os.path.join(morph_images_path, "landmarks", landmarks_folder)
        
        if os.path.exists(category_path):
            process_category(category_path, landmarks_path)
        else:
            print(f"  Category folder not found: {category_path}")
    
    print("\n" + "=" * 50)
    print("Landmark generation complete!")
    print("=" * 50)

if __name__ == "__main__":
    main()
