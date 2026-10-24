"""Fetch real OSM venues in Greater Columbus, prioritize OSU; no synthetic venues.
Run: python build_columbus_osm.py --out columbus_osm_places.csv
Requires network access to public Overpass API. OSM data © OpenStreetMap contributors (ODbL).
"""
import argparse,csv,json,math,time,urllib.parse,urllib.request
from datetime import datetime,timezone
OSU=(40.0000,-83.0145) # approximate campus center, not a user's location
BBOX=(39.75,-83.35,40.25,-82.70) # broad metro rectangle, not municipal boundary
TAGS=[('amenity',x) for x in ['restaurant','cafe','fast_food','food_court','bar','pub','ice_cream','cinema','theatre','arts_centre','nightclub']] + [('shop',x) for x in ['bakery','coffee','confectionery','mall','books','clothes']] + [('tourism',x) for x in ['museum','gallery','attraction']] + [('leisure',x) for x in ['park','bowling_alley','amusement_arcade','fitness_centre','sports_centre']]
def distance(a,b,c,d):
 r=6371; p1,p2=math.radians(a),math.radians(c);dp=p2-p1;dl=math.radians(d-b)
 h=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
 return 2*r*math.asin(min(1,math.sqrt(h)))
def get(query):
 payload=urllib.parse.urlencode({'data':query}).encode()
 for host in ['https://overpass-api.de/api/interpreter','https://overpass.nchc.org.tw/api/interpreter']:
  try:
   req=urllib.request.Request(host,data=payload,headers={'User-Agent':'ColumbusHackathonPOIResearch/1.0 (educational prototype)'})
   with urllib.request.urlopen(req,timeout=110) as resp:return json.load(resp)
  except Exception as e:print('Endpoint failed:',host,str(e)[:120])
 raise RuntimeError('Could not reach Overpass. Retry later or use a local OSM extract.')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--out',default='columbus_osm_places.csv');args=ap.parse_args()
 s,w,n,e=BBOX
 selector='\n'.join(f' nwr["{k}"="{v}"]({s},{w},{n},{e});' for k,v in TAGS)
 q=f'[out:json][timeout:100];(\n{selector}\n);out center tags;'
 data=get(q); seen=set();rows=[]
 for el in data.get('elements',[]):
  t=el.get('tags',{});name=t.get('name');pos=el.get('center',el)
  if not name or 'lat' not in pos or 'lon' not in pos:continue
  lat,lon=pos['lat'],pos['lon'];uid=f"{el['type']}/{el['id']}"
  if uid in seen:continue
  seen.add(uid);d=distance(lat,lon,*OSU)
  cat=next((v for k,v in TAGS if t.get(k)==v),'other')
  addr=' '.join(filter(None,[t.get('addr:housenumber'),t.get('addr:street')])).strip()
  rows.append({'place_id':'osm:'+uid,'name':name,'category':cat,'lat':lat,'lon':lon,'address':addr,'city':t.get('addr:city',''),'postcode':t.get('addr:postcode',''),'cuisine':t.get('cuisine',''),'opening_hours_raw':t.get('opening_hours',''),'website':t.get('website',''),'osm_url':f'https://www.openstreetmap.org/{uid}','distance_osu_km':round(d,2),'osu_cluster':'CORE' if d<=1.5 else 'NEAR' if d<=3 else 'METRO','source':'OpenStreetMap','record_type':'REAL_OSM','data_quality':'OSM community-contributed; verify before live use','extracted_utc':datetime.now(timezone.utc).isoformat()})
 rows.sort(key=lambda x:(0 if x['osu_cluster']=='CORE' else 1 if x['osu_cluster']=='NEAR' else 2,x['distance_osu_km'],x['name']))
 with open(args.out,'w',newline='',encoding='utf-8') as f:
  wr=csv.DictWriter(f,fieldnames=list(rows[0]) if rows else ['place_id']);wr.writeheader();wr.writerows(rows)
 print(f'Exported {len(rows)} real OSM places to {args.out}; OSU core {sum(r["osu_cluster"]=="CORE" for r in rows)}, near {sum(r["osu_cluster"]=="NEAR" for r in rows)}')
if __name__=='__main__':main()
