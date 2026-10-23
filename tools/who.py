import json,urllib.request,os
K="AIzaSyBnmVwD79y26gs4dVjMEzYyOa7sxdhtR_I";B="https://firestore.googleapis.com/v1/projects/conseil-des-sages/databases/(default)/documents/"
def lst(c):
    out=[];tok=""
    while True:
        u=B+c+"?pageSize=300&key="+K+(("&pageToken="+tok) if tok else "")
        j=json.load(urllib.request.urlopen(u));out+=j.get("documents",[]);tok=j.get("nextPageToken")
        if not tok:return out
def val(f):
    for k,v in f.items():
        if k in("stringValue","integerValue","booleanValue","timestampValue","doubleValue"):return v
    return None
res={"riot":[],"claims":[]}
for d in lst("riot"):
    f=d.get("fields",{});p=val(f.get("pseudo",{})) or ""
    res["riot"].append({"id":d["name"].split("/")[-1],"pseudo":p,"riotId":val(f.get("riotId",{})),"upd":d.get("updateTime")})
for d in lst("claims"):
    f=d.get("fields",{});res["claims"].append({"old":d["name"].split("/")[-1],"by":val(f.get("by",{}))})
def conv(v):
    if "mapValue" in v:return {k:conv(x) for k,x in v["mapValue"].get("fields",{}).items()}
    if "arrayValue" in v:return [conv(x) for x in v["arrayValue"].get("values",[])]
    if "nullValue" in v:return None
    return val(v)
res["snaps"]={d["name"].split("/")[-1]:{"upd":d.get("updateTime"),"create":d.get("createTime"),**{k:conv(x) for k,x in d.get("fields",{}).items()}} for d in lst("ladderSnap")}
res["ladder"]={d["name"].split("/")[-1]:{"upd":d.get("updateTime"),**{k:conv(x) for k,x in d.get("fields",{}).items()}} for d in lst("ladder")}
res["riotFull"]={d["name"].split("/")[-1]:{"upd":d.get("updateTime"),**{k:conv(x) for k,x in d.get("fields",{}).items()}} for d in lst("riot")}
os.makedirs("out",exist_ok=True);json.dump(res,open("out/who.json","w"),indent=1,ensure_ascii=False)
