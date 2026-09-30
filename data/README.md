# Indian campus energy test sample

Source: [COMBED](https://combed.github.io/), publicly released by Nipun Batra,
Oliver Parson, Mario Berges, Amarjeet Singh and Alex Rogers, IIIT-Delhi and collaborators.
Paper: [A comparison of non-intrusive load monitoring methods for commercial and residential buildings](https://arxiv.org/abs/1408.6595).

The source archive is https://combed.github.io/downloads/combed.zip. The selected
headerless CSV is `iiitd/Academic Block/Building Total Mains/0/Power.csv`:
Unix timestamps in milliseconds and active power in watts. NILMTK's COMBED
converter confirms the timestamp format and Asia/Kolkata timezone.

The downloadable file `public/data/india-campus-energy.csv` is a derived test
sample, not the original raw CSV: 504 hourly kWh estimates from 21 complete local
days between June 3 and June 24, 2014. June 5 is excluded by the coverage checks,
so the importer reports 24 missing hours. Original dates are retained.

For each retained hour, timestamp-weighted integration holds the measured power
until the next reading and extends the first and last readings to the hour
boundaries. Integrated watt-milliseconds are divided by 3,600,000 and 1,000 to
obtain kWh. An hour needs at least 118 of the nominal 120 samples (98.3%), no
internal gap over 60 seconds, and at most 60 seconds at either boundary. Only
days with all 24 qualifying hours are retained. No scaling or artificial spikes
are added. Hourly energy is therefore an estimate derived from measured power.

`india-campus-energy.json` contains the same CSV plus attribution, conversion
details and SHA-256 hashes. `node scripts/prepare-india-sample.mjs` reproduces both
files by fetching only the relevant ZIP member through ordinary HTTP ranges.

Validation: `node --experimental-strip-types --test tests/campus-analytics.test.mjs tests/campus-csv.test.mjs`.
The last seven retained days are tested chronologically; predictions for each
day use only earlier readings. WAPE is total absolute error divided by total
observed energy; MAE is mean absolute hourly error. The current median baseline
achieves 18.7% WAPE and 5.60 kWh MAE over 168 held-out hours. These are results on
this historical sample, not evidence of future accuracy at another campus.

CSV imports accept one building/resource and hourly consumption per file:
`recorded_at,building,resource,value,unit`. Units are energy/kWh or water/kL.
Timestamps require explicit offsets and align to the hour in IST. Identical
duplicates are skipped; conflicts, malformed dates, missing values and invalid
units are rejected. Gaps are reported and not filled by the importer. Imported
readings and metadata persist in D1. An upload becomes active only after all its
rows are saved. Earlier datasets are retained, and a repeat import is idempotent.

Water, transportation, carbon, recommendations and the sustainability score
remain explicitly marked as demo data. Energy alone is connected to COMBED.
