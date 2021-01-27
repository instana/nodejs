#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################

sed -i '' "1i\\
/*\\
\ * (c) Copyright IBM Corp. 2021\\
\ * (c) Copyright Instana Inc. and contributors $2\\
\ */\\
\\
" $1
