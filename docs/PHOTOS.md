# Globoknot photos: one per country

Tap a country on the home globe and its sheet opens: a photo at the top, then a map and the facts. The photo is
yours. Put a file named after the country's three-letter code in `public/photos/` (for example
`public/photos/fra.jpg` for France) and build the site again: the build lists the photos it finds, and each one shows
on its country's sheet. A country without a photo shows its sheet without one (the private preview shows a dashed box
with the file name where the photo goes). Nothing is fetched for a country without a photo.

The code is `src/scripts/sheet.ts`; the list is made in `src/pages/index.astro`.

## The files

- **Name:** the country's code in lower case, then `.jpg`, `.webp`, `.png` or `.avif` (`fra.jpg`, `che.webp`). The
  codes are in the table below.
- **Shape:** 16:9, landscape. It is shown 340 px wide on a computer and up to 560 px on a phone, so **1280 x 720** is
  plenty (sharp on high-density screens too). Other shapes are cropped to 16:9 from the middle.
- **Size:** under about **200 KB** each. JPEG at quality 75 to 80, or WebP, gets a 1280 x 720 photo there easily
  (Squoosh, squoosh.app, does it in the browser). 194 photos at 200 KB is about 39 MB in all, loaded only when a sheet
  opens.
- **Your own photos, or ones you may use:** a photo you took, or one whose licence allows it (Unsplash and Pexels
  photos may be used without credit; Wikimedia Commons ones usually need a credit line, see below). Not a photo found
  on a search engine.

## A credit line (optional)

To put a small line under a photo ("Photo: Jane Doe, CC BY 4.0"), add `public/photos/credits.json` with the code in
lower case and the text:

```json
{
  "fra": "Mont Saint-Michel. Photo: James",
  "che": "Photo: Jane Doe, CC BY 4.0, Wikimedia Commons"
}
```

## The 194 codes

| Country | File |
|---|---|
| Afghanistan | `afg.jpg` |
| Albania | `alb.jpg` |
| Algeria | `dza.jpg` |
| Andorra | `and.jpg` |
| Angola | `ago.jpg` |
| Antigua and Barbuda | `atg.jpg` |
| Argentina | `arg.jpg` |
| Armenia | `arm.jpg` |
| Australia | `aus.jpg` |
| Austria | `aut.jpg` |
| Azerbaijan | `aze.jpg` |
| Bahamas | `bhs.jpg` |
| Bahrain | `bhr.jpg` |
| Bangladesh | `bgd.jpg` |
| Barbados | `brb.jpg` |
| Belarus | `blr.jpg` |
| Belgium | `bel.jpg` |
| Belize | `blz.jpg` |
| Benin | `ben.jpg` |
| Bhutan | `btn.jpg` |
| Bolivia | `bol.jpg` |
| Bosnia and Herzegovina | `bih.jpg` |
| Botswana | `bwa.jpg` |
| Brazil | `bra.jpg` |
| Brunei | `brn.jpg` |
| Bulgaria | `bgr.jpg` |
| Burkina Faso | `bfa.jpg` |
| Burundi | `bdi.jpg` |
| Cambodia | `khm.jpg` |
| Cameroon | `cmr.jpg` |
| Canada | `can.jpg` |
| Cape Verde | `cpv.jpg` |
| Central African Republic | `caf.jpg` |
| Chad | `tcd.jpg` |
| Chile | `chl.jpg` |
| China | `chn.jpg` |
| Colombia | `col.jpg` |
| Comoros | `com.jpg` |
| Costa Rica | `cri.jpg` |
| Croatia | `hrv.jpg` |
| Cuba | `cub.jpg` |
| Cyprus | `cyp.jpg` |
| Czechia | `cze.jpg` |
| Denmark | `dnk.jpg` |
| Djibouti | `dji.jpg` |
| Dominica | `dma.jpg` |
| Dominican Republic | `dom.jpg` |
| DR Congo | `cod.jpg` |
| Ecuador | `ecu.jpg` |
| Egypt | `egy.jpg` |
| El Salvador | `slv.jpg` |
| Equatorial Guinea | `gnq.jpg` |
| Eritrea | `eri.jpg` |
| Estonia | `est.jpg` |
| Eswatini | `swz.jpg` |
| Ethiopia | `eth.jpg` |
| Fiji | `fji.jpg` |
| Finland | `fin.jpg` |
| France | `fra.jpg` |
| Gabon | `gab.jpg` |
| Gambia | `gmb.jpg` |
| Georgia | `geo.jpg` |
| Germany | `deu.jpg` |
| Ghana | `gha.jpg` |
| Greece | `grc.jpg` |
| Grenada | `grd.jpg` |
| Guatemala | `gtm.jpg` |
| Guinea | `gin.jpg` |
| Guinea-Bissau | `gnb.jpg` |
| Guyana | `guy.jpg` |
| Haiti | `hti.jpg` |
| Honduras | `hnd.jpg` |
| Hungary | `hun.jpg` |
| Iceland | `isl.jpg` |
| India | `ind.jpg` |
| Indonesia | `idn.jpg` |
| Iran | `irn.jpg` |
| Iraq | `irq.jpg` |
| Ireland | `irl.jpg` |
| Israel | `isr.jpg` |
| Italy | `ita.jpg` |
| Ivory Coast | `civ.jpg` |
| Jamaica | `jam.jpg` |
| Japan | `jpn.jpg` |
| Jordan | `jor.jpg` |
| Kazakhstan | `kaz.jpg` |
| Kenya | `ken.jpg` |
| Kiribati | `kir.jpg` |
| Kuwait | `kwt.jpg` |
| Kyrgyzstan | `kgz.jpg` |
| Laos | `lao.jpg` |
| Latvia | `lva.jpg` |
| Lebanon | `lbn.jpg` |
| Lesotho | `lso.jpg` |
| Liberia | `lbr.jpg` |
| Libya | `lby.jpg` |
| Liechtenstein | `lie.jpg` |
| Lithuania | `ltu.jpg` |
| Luxembourg | `lux.jpg` |
| Madagascar | `mdg.jpg` |
| Malawi | `mwi.jpg` |
| Malaysia | `mys.jpg` |
| Maldives | `mdv.jpg` |
| Mali | `mli.jpg` |
| Malta | `mlt.jpg` |
| Marshall Islands | `mhl.jpg` |
| Mauritania | `mrt.jpg` |
| Mauritius | `mus.jpg` |
| Mexico | `mex.jpg` |
| Micronesia | `fsm.jpg` |
| Moldova | `mda.jpg` |
| Monaco | `mco.jpg` |
| Mongolia | `mng.jpg` |
| Montenegro | `mne.jpg` |
| Morocco | `mar.jpg` |
| Mozambique | `moz.jpg` |
| Myanmar | `mmr.jpg` |
| Namibia | `nam.jpg` |
| Nauru | `nru.jpg` |
| Nepal | `npl.jpg` |
| Netherlands | `nld.jpg` |
| New Zealand | `nzl.jpg` |
| Nicaragua | `nic.jpg` |
| Niger | `ner.jpg` |
| Nigeria | `nga.jpg` |
| North Korea | `prk.jpg` |
| North Macedonia | `mkd.jpg` |
| Norway | `nor.jpg` |
| Oman | `omn.jpg` |
| Pakistan | `pak.jpg` |
| Palau | `plw.jpg` |
| Panama | `pan.jpg` |
| Papua New Guinea | `png.jpg` |
| Paraguay | `pry.jpg` |
| Peru | `per.jpg` |
| Philippines | `phl.jpg` |
| Poland | `pol.jpg` |
| Portugal | `prt.jpg` |
| Qatar | `qat.jpg` |
| Republic of the Congo | `cog.jpg` |
| Romania | `rou.jpg` |
| Russia | `rus.jpg` |
| Rwanda | `rwa.jpg` |
| Saint Kitts and Nevis | `kna.jpg` |
| Saint Lucia | `lca.jpg` |
| Saint Vincent and the Grenadines | `vct.jpg` |
| Samoa | `wsm.jpg` |
| San Marino | `smr.jpg` |
| São Tomé and Príncipe | `stp.jpg` |
| Saudi Arabia | `sau.jpg` |
| Senegal | `sen.jpg` |
| Serbia | `srb.jpg` |
| Seychelles | `syc.jpg` |
| Sierra Leone | `sle.jpg` |
| Singapore | `sgp.jpg` |
| Slovakia | `svk.jpg` |
| Slovenia | `svn.jpg` |
| Solomon Islands | `slb.jpg` |
| Somalia | `som.jpg` |
| South Africa | `zaf.jpg` |
| South Korea | `kor.jpg` |
| South Sudan | `ssd.jpg` |
| Spain | `esp.jpg` |
| Sri Lanka | `lka.jpg` |
| Sudan | `sdn.jpg` |
| Suriname | `sur.jpg` |
| Sweden | `swe.jpg` |
| Switzerland | `che.jpg` |
| Syria | `syr.jpg` |
| Tajikistan | `tjk.jpg` |
| Tanzania | `tza.jpg` |
| Thailand | `tha.jpg` |
| Timor-Leste | `tls.jpg` |
| Togo | `tgo.jpg` |
| Tonga | `ton.jpg` |
| Trinidad and Tobago | `tto.jpg` |
| Tunisia | `tun.jpg` |
| Türkiye | `tur.jpg` |
| Turkmenistan | `tkm.jpg` |
| Tuvalu | `tuv.jpg` |
| Uganda | `uga.jpg` |
| Ukraine | `ukr.jpg` |
| United Arab Emirates | `are.jpg` |
| United Kingdom | `gbr.jpg` |
| United States | `usa.jpg` |
| Uruguay | `ury.jpg` |
| Uzbekistan | `uzb.jpg` |
| Vanuatu | `vut.jpg` |
| Vatican City | `vat.jpg` |
| Venezuela | `ven.jpg` |
| Vietnam | `vnm.jpg` |
| Yemen | `yem.jpg` |
| Zambia | `zmb.jpg` |
| Zimbabwe | `zwe.jpg` |
