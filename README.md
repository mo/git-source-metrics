# git-source-metrics

git-source-metrics is a script that can measure things (like lines of code, lint
error count, commit rate, the number of active developers or anything else that
can be expressed as a shell command that prints a single integer or float
value).

git-source-metrics will make measurements for each commit (or once every
N days) throughout the git history and produce time series plots that shows how
the metrics changed. It also offers some basic analysis features like selecting
a range and seeing how much each series changed both in absolute numbers and as
a percentage during that period.


## License

GPLv3
