#!/bin/bash

# Step 1: Find all files in the repository
files=$(git ls-files)

# Step 2: Run dos2unix on all files
for file in $files; do
    dos2unix $file
done

# Step 3: Check if there are any changes
if [[ $(git diff --shortstat 2> /dev/null | tail -n1) != "" ]]; then
    # Step 4: Add all changes to the staging area
    git add -A

    # Step 5: Commit the changes
    # git commit -m "Converted files to Unix format"
fi
