import re

with open("frontend/src/components/LeadCard.jsx", "r") as f:
    content = f.read()

# Update the details section inside LeadCard
old_card = r'''        \{\(lead\.no_of_vehicles \|\| lead\.remarks\) && \(
          <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2 text-slate-500">
            \{lead\.no_of_vehicles && <div><span className="font-medium text-slate-700">Vehicles:</span> \{lead\.no_of_vehicles\}</div>\}
            \{lead\.remarks && <div className="line-clamp-2"><span className="font-medium text-slate-700">Remarks:</span> \{lead\.remarks\}</div>\}
          </div>
        \)\}'''

new_card = '''        {lead.segment === "driver" ? (
          (lead.location || lead.rc) && (
            <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2 text-slate-500">
              {lead.location && <div><span className="font-medium text-slate-700">Location:</span> {lead.location}</div>}
              {lead.rc && <div><span className="font-medium text-slate-700">RC Available:</span> {lead.rc.toUpperCase()}</div>}
            </div>
          )
        ) : (
          (lead.no_of_vehicles || lead.remarks) && (
            <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2 text-slate-500">
              {lead.no_of_vehicles && <div><span className="font-medium text-slate-700">Vehicles:</span> {lead.no_of_vehicles}</div>}
              {lead.remarks && <div className="line-clamp-2"><span className="font-medium text-slate-700">Remarks:</span> {lead.remarks}</div>}
            </div>
          )
        )}'''

content = re.sub(old_card, new_card, content)

# Also update the navigation link to include driver prefix if segment is driver
# Wait, navigate(`/leads/${lead.id}`) -> navigate(lead.segment === "driver" ? `/drivers/leads/${lead.id}` : `/leads/${lead.id}`)

content = re.sub(
    r'navigate\(`/leads/\$\{lead\.id\}`\)',
    r'navigate(lead.segment === "driver" ? `/drivers/leads/${lead.id}` : `/leads/${lead.id}`)',
    content
)

content = re.sub(
    r'navigate\(`/leads/\$\{lead\.id\}\?tab=whatsapp`\)',
    r'navigate(lead.segment === "driver" ? `/drivers/leads/${lead.id}?tab=whatsapp` : `/leads/${lead.id}?tab=whatsapp`)',
    content
)

content = re.sub(
    r'navigate\(`/leads/\$\{lead\.id\}\?edit=true`\)',
    r'navigate(lead.segment === "driver" ? `/drivers/leads/${lead.id}?edit=true` : `/leads/${lead.id}?edit=true`)',
    content
)

with open("frontend/src/components/LeadCard.jsx", "w") as f:
    f.write(content)

print("Patched LeadCard")
