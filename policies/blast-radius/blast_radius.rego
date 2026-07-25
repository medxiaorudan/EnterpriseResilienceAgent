package era.blast_radius

default allowed := false

allowed if {
  input.target_count_delta <= input.max_target_count_delta
  input.cross_region == false
}
