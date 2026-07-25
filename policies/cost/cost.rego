package era.cost

default within_budget := false

within_budget if {
  input.estimated_cost_per_hour <= input.max_cost_per_hour
}
