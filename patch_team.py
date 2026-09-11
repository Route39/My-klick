import re

with open("frontend/src/pages/Team.jsx", "r") as f:
    content = f.read()

# I am looking for `export default function Team() {` but wait, in the head output it was NOT `export default function Team()`.
# Wait, let's grep for Team function definition.
