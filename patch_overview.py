import re

with open("frontend/src/pages/LeadProfile.jsx", "r") as f:
    content = f.read()

old_overview = r'''function Overview\(\{ lead \}\) \{
  const rows = \[
    \["Phone", lead\.phone\], \["WhatsApp", lead\.whatsapp\], \["Company", lead\.company \|\| "—"\],
    \["Assigned to", lead\.assigned_name \|\| "Unassigned"\], \["Created", formatDay\(lead\.created_at\)\],
    \["No of vehicles", lead\.no_of_vehicles \|\| "—"\]
  \];
  return \(
    <Panel>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        \{rows\.map\(\(\[k, v\]\) => \(
          <div key=\{k\} className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-sm text-slate-400">\{k\}</span>
            <span className="font-medium text-slate-900">\{v\}</span>
          </div>
        \)\)\}
      </div>
      \{lead\.notes && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><span className="font-semibold block mb-1">Notes:</span>\{lead\.notes\}</p>\}
      \{lead\.remarks && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><span className="font-semibold block mb-1">Remarks:</span>\{lead\.remarks\}</p>\}
    </Panel>
  \);
\}'''

new_overview = '''import { FileText, Image as ImageIcon } from "lucide-react";

function Overview({ lead }) {
  const isDriver = lead.segment === "driver";
  const rows = isDriver
    ? [
        ["Phone", lead.phone], ["Location", lead.location || "—"], 
        ["RC Available?", (lead.rc || "—").toUpperCase()],
        ["Assigned to", lead.assigned_name || "Unassigned"], 
        ["Created", formatDay(lead.created_at)]
      ]
    : [
        ["Phone", lead.phone], ["WhatsApp", lead.whatsapp], ["Company", lead.company || "—"],
        ["Assigned to", lead.assigned_name || "Unassigned"], ["Created", formatDay(lead.created_at)],
        ["No of vehicles", lead.no_of_vehicles || "—"]
      ];

  const renderFileLink = (label, url) => {
    if (!url) return null;
    return (
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <span className="text-sm text-slate-400">{label}</span>
        <a href={url.startsWith('http') ? url : `http://localhost:8000${url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100">
          <FileText className="h-3 w-3" /> View Document
        </a>
      </div>
    );
  };

  return (
    <Panel>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-sm text-slate-400">{k}</span>
            <span className="font-medium text-slate-900">{v}</span>
          </div>
        ))}
        {isDriver && renderFileLink("Aadhaar Card", lead.aadhaar_url)}
        {isDriver && renderFileLink("PAN Card", lead.pan_url)}
        {isDriver && renderFileLink("License", lead.license_url)}
      </div>
      {lead.notes && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><span className="font-semibold block mb-1">Notes:</span>{lead.notes}</p>}
      {lead.remarks && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><span className="font-semibold block mb-1">Remarks:</span>{lead.remarks}</p>}
    </Panel>
  );
}'''

content = re.sub(old_overview, new_overview, content)

# I also need to make sure the imports don't conflict, FileText is already imported or I can just import it.
# Actually I shouldn't add import in the middle of file. Let me move the import to top.
content = content.replace('import { FileText, Image as ImageIcon } from "lucide-react";\n\n', '')
if "FileText" not in content:
    content = content.replace('from "lucide-react";', ', FileText } from "lucide-react";')

with open("frontend/src/pages/LeadProfile.jsx", "w") as f:
    f.write(content)

print("Patched LeadProfile")
