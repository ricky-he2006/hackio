"""Read the supplied workbook without altering it. Standard library only."""
import json, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def extract(path):
    with zipfile.ZipFile(path) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        book = ET.fromstring(z.read('xl/workbook.xml'))
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        result = {}
        for sheet in book.find('s:sheets', NS):
            target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(z.read(target)).findall('.//s:sheetData/s:row', NS):
                values = {}
                for c in row:
                    letters = ''.join(x for x in c.attrib['r'] if x.isalpha())
                    col = 0
                    for letter in letters: col = col * 26 + ord(letter) - 64
                    v = c.find('s:v', NS)
                    value = v.text if v is not None else ''.join(c.find('s:is', NS).itertext()) if c.find('s:is', NS) is not None else ''
                    values[col-1] = strings[int(value)] if c.attrib.get('t') == 's' else value
                rows.append(values)
            if rows:
                headers = rows[0]
                result[sheet.attrib['name']] = [{key: r.get(i, '') for i, key in headers.items()} for r in rows[1:]]
        return result

if __name__ == '__main__':
    out = Path(__file__).resolve().parent.parent / 'data' / 'seed.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(extract(sys.argv[1]), ensure_ascii=False), encoding='utf-8')
    print('Imported workbook sheets to data/seed.json')
