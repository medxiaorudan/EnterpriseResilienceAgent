package era.cloud_scope

default allowed := false

allowed if {
  input.provider in {"aws", "gcp"}
  input.region in input.allowed_regions
}
