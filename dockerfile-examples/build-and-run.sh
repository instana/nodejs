function buildAndRun {
  variant=$1
  dockerfile=Dockerfile.$variant
  dockertag=$variant-ins
  echo "Building $dockerfile -> $dockertag"
  docker build -f $dockerfile -t $dockertag .
  echo "docker build exit status: $?"
  echo "Running $variant"
  docker run -p 3333:3333 $dockertag
}

