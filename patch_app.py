import re

with open("frontend/src/App.js", "r") as f:
    content = f.read()

# I will pass segment="investor" to the regular Team page just to be explicit
content = content.replace('<Route path="/team" element={<Team />} />', '<Route path="/team" element={<Team segment="investor" />} />')

# Add the /drivers/team route
old_routes = r'''            <Route path="/drivers/customers/:id" element={<CustomerDetail />} />'''
new_routes = r'''            <Route path="/drivers/customers/:id" element={<CustomerDetail />} />
            <Route path="/drivers/team" element={<Team segment="driver" />} />'''

content = re.sub(old_routes, new_routes, content)

with open("frontend/src/App.js", "w") as f:
    f.write(content)

print("Patched App.js")
