# Fixture for the Extension Development Host — generated, do not edit.
# %%
import fleet
import polars as pl

# %%
ex = (
    fleet.frame(pl.read_csv("../../data/raw/ex_raw.csv"))
    .sdtm.assign("USUBJID", source="subject_id")
    .to_frame()
)
