#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2021
#######################################

sed -i '' "1i\\
/*\\
\ * (c) Copyright IBM Corp. 2021\\
\ * (c) Copyright Instana Inc. $2\\
\ */\\
\\
" $1
