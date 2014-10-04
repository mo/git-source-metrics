import os
import threading
import subprocess

def find_executable(name, paths=None, recursive=False):
    if not paths:
        paths = os.environ["PATH"].split(":")
    if type(paths) == str:
        paths = [paths]
    for search_path in paths:
        filepath = os.path.expanduser(os.path.join(search_path, name))
        if os.path.isfile(filepath) and os.access(filepath, os.X_OK):
            return filepath
        if recursive:
            for root, subdirs, files in os.walk(search_path):
                for subdir in subdirs:
                    filepath = os.path.expanduser(os.path.join(root, subdir, name))
                    if os.path.isfile(filepath) and os.access(filepath, os.X_OK):
                        return filepath
    return None

class SubprocessTimeout(Exception):
    def __init__(self, argv, timeout):
        error_msg = "executing command %s took longer than specified timeout of %.1f seconds, aborting." % (repr(argv), timeout)
        super(SubprocessTimeout, self).__init__(error_msg)

class SubprocessError(Exception):
    def __init__(self, argv,
                       actual_returncode, actual_stdout, actual_stderr,
                       expected_returncode, expected_stdout, expected_stderr,
                       popen_flags):
        if isinstance(argv, basestring):
            cmd = argv
        else:
            cmd = " ".join(argv)

        error_msg = "failed to execute command '%s'." % cmd
        if expected_returncode is not None and expected_returncode != actual_returncode:
            error_msg += " Expected process returncode %d but got %d."% (expected_returncode, actual_returncode)
        if expected_stdout is not None and expected_stdout != actual_stdout:
            error_msg += " Expected process stdout to be '%s' but got '%s'."% (expected_stdout, actual_stdout)
        if expected_stderr is not None and expected_stderr != actual_stderr:
            error_msg += " Expected process stderr to be '%s' but got '%s'."% (expected_stderr, actual_stderr)
        if popen_flags:
            error_msg += " Note: Popen() flags was %s." % repr(popen_flags)
        super(SubprocessError, self).__init__(error_msg)
        self.argv = argv
        self.actual_returncode = actual_returncode
        self.actual_stdout = actual_stdout
        self.actual_stderr = actual_stderr
        self.expected_returncode = expected_returncode
        self.expected_stdout = expected_stdout
        self.expected_stderr = expected_stderr


# helper class for run() below
class SubprocessWithTimeout(threading.Thread):
    DEFAULT_TIMEOUT_SECS = 30
    def __init__(self, argv, **kvargs):
        threading.Thread.__init__(self)
        self.argv = argv
        self.timeout = kvargs.pop('timeout', SubprocessWithTimeout.DEFAULT_TIMEOUT_SECS)
        self.expected_returncode = kvargs.pop('expected_returncode', None)
        self.expected_stdout = kvargs.pop('expected_stdout', None)
        self.expected_stderr = kvargs.pop('expected_stderr', None)
        self.async = kvargs.pop('async', None)
        self.kvargs = kvargs
        self.stdout = ""
        self.stderr = ""
        self.returncode = None
        self.exception = None
    def run(self):
        if self.kvargs.pop('debug', None) or os.environ.get("debug", None):
            debug_mode = True
            print
            if isinstance(self.argv, list):
                print "CMD: " + " ".join(self.argv)
            else:
                print "CMD: " + self.argv
        else:
            debug_mode = False

        try:
            process = subprocess.Popen(self.argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **self.kvargs)
        except Exception as e:
            self.exception = e
            return
        self.stdout, self.stderr = process.communicate()
        self.returncode = process.returncode
        if debug_mode:
            print "returncode=%d" % self.returncode
            print "stderr='%s'" % str(self.stderr)
            print "stdout='%s'" % str(self.stdout)
    def startwait(self):
        self.start()
        if self.async:
            return
        self.join(self.timeout)
        if self.exception:
            raise self.exception
        if self.is_alive():
            self._Thread__stop()
            self.join()
            raise SubprocessTimeout(self.argv, self.timeout)
        if (self.expected_returncode is not None and self.returncode != self.expected_returncode) or \
           (self.expected_stdout is not None and self.stdout.strip() != self.expected_stdout.strip()) or \
           (self.expected_stderr is not None and self.stderr.strip() != self.expected_stderr.strip()):
            raise SubprocessError(self.argv, self.returncode, self.stdout, self.stderr,
                                  self.expected_returncode, self.expected_stdout, self.expected_stderr,
                                  self.kvargs)
        return (self.returncode, self.stdout, self.stderr)

def run(argv, **kvargs):
    return SubprocessWithTimeout(argv, **kvargs).startwait()
