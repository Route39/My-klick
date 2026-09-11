import os
import re

def replace_in_dir(directory):
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.venv' in dirs:
            dirs.remove('.venv')
        if '.git' in dirs:
            dirs.remove('.git')
        if 'build' in dirs:
            dirs.remove('build')
            
        for file in files:
            if not file.endswith(('.js', '.jsx', '.html', '.css', '.py', '.json', '.md', '.env')):
                continue
                
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Check if it contains Myklick case insensitive
                if re.search(r'Myklick', content, re.IGNORECASE):
                    # Replace case-insensitively, but keep the replacement exactly 'Myklick' or match case if needed.
                    # Usually just replacing 'Myklick' -> 'Myklick' and 'Myklick' -> 'myklick' is safe.
                    new_content = re.sub(r'Myklick', 'Myklick', content, flags=re.IGNORECASE)
                    
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {filepath}")
            except Exception as e:
                print(f"Error reading {filepath}: {e}")

replace_in_dir('/Users/admin/Desktop/Myklick')
print("Replacement complete.")
